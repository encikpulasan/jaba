// API Key Management System
// Handles API key generation, validation, and scoped permissions

import type { Permission, UUID } from "@/types";
import { db } from "@/lib/db/mod.ts";
import { KeyPatterns } from "@/lib/db/patterns.ts";
import { RBACManager } from "./rbac.ts";

export interface ApiKey {
  id: UUID;
  name: string;
  key: string;
  prefix: string;
  hashedKey: string;
  userId: UUID;
  permissions: Permission[];
  scopes: string[];
  expiresAt?: number;
  lastUsedAt?: number;
  usageCount: number;
  rateLimit?: {
    requests: number;
    window: number; // in seconds
  };
  ipWhitelist?: string[];
  environment?: "development" | "staging" | "production" | "all";
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface ApiKeyUsage {
  id: UUID;
  apiKeyId: UUID;
  endpoint: string;
  method: string;
  ipAddress: string;
  userAgent?: string;
  timestamp: number;
  responseStatus: number;
  responseTime: number;
  payload?: {
    size: number;
    type: string;
  };
}

export interface CreateApiKeyRequest {
  name: string;
  permissions: Permission[];
  scopes?: string[];
  expiresAt?: number;
  rateLimit?: {
    requests: number;
    window: number;
  };
  ipWhitelist?: string[];
  environment?: "development" | "staging" | "production" | "all";
  metadata?: Record<string, unknown>;
}

export class ApiKeyManager {
  private static readonly KEY_PREFIX = "masa_";
  private static readonly KEY_LENGTH = 32;

  // Generate new API key
  static async createApiKey(
    userId: UUID,
    request: CreateApiKeyRequest,
  ): Promise<{ apiKey: ApiKey; plainKey: string }> {
    // Validate user permissions
    const userPermissions = await RBACManager.getUserPermissions(userId);
    const hasManageApiKeys = userPermissions.includes("manage_api_keys");

    if (!hasManageApiKeys) {
      throw new Error("Insufficient permissions to create API keys");
    }

    // Validate requested permissions
    const validPermissions = await this.validatePermissions(
      request.permissions,
      userPermissions,
    );
    if (!validPermissions) {
      throw new Error("Cannot grant permissions that you don't possess");
    }

    // Generate key components
    const keyId = crypto.randomUUID();
    const plainKey = this.generateApiKey();
    const hashedKey = await this.hashApiKey(plainKey);
    const prefix = this.extractPrefix(plainKey);
    const now = Date.now();

    const apiKey: ApiKey = {
      id: keyId,
      name: request.name,
      key: plainKey.substring(0, 8) + "...", // Store truncated version for display
      prefix,
      hashedKey,
      userId,
      permissions: request.permissions,
      scopes: request.scopes || [],
      expiresAt: request.expiresAt,
      usageCount: 0,
      rateLimit: request.rateLimit,
      ipWhitelist: request.ipWhitelist,
      environment: request.environment || "all",
      isActive: true,
      createdAt: now,
      updatedAt: now,
      metadata: request.metadata,
    };

    // Store API key
    const connection = db.getConnection();
    const atomic = (connection.kv as Deno.Kv).atomic();

    atomic.set(KeyPatterns.apiKeys.byId(keyId), apiKey);
    atomic.set(KeyPatterns.apiKeys.byKey(hashedKey), keyId);
    atomic.set(KeyPatterns.apiKeys.byUserId(userId), keyId);

    if (apiKey.isActive) {
      atomic.set(KeyPatterns.apiKeys.active(), keyId);
    }

    await atomic.commit();

    return { apiKey, plainKey };
  }

  // Validate API key and return associated data
  static async validateApiKey(
    key: string,
    requiredPermissions?: Permission[],
    requiredScopes?: string[],
  ): Promise<{
    isValid: boolean;
    apiKey?: ApiKey;
    reason?: string;
  }> {
    try {
      const hashedKey = await this.hashApiKey(key);
      const connection = db.getConnection();

      // Get API key ID
      const keyIdResult = await (connection.kv as Deno.Kv).get<UUID>(
        KeyPatterns.apiKeys.byKey(hashedKey),
      );

      if (!keyIdResult.value) {
        return { isValid: false, reason: "API key not found" };
      }

      // Get API key data
      const apiKeyResult = await (connection.kv as Deno.Kv).get<ApiKey>(
        KeyPatterns.apiKeys.byId(keyIdResult.value),
      );

      if (!apiKeyResult.value) {
        return { isValid: false, reason: "API key data not found" };
      }

      const apiKey = apiKeyResult.value;

      // Check if key is active
      if (!apiKey.isActive) {
        return { isValid: false, reason: "API key is disabled" };
      }

      // Check expiration
      if (apiKey.expiresAt && Date.now() > apiKey.expiresAt) {
        return { isValid: false, reason: "API key has expired" };
      }

      // Check permissions
      if (requiredPermissions && requiredPermissions.length > 0) {
        const hasPermissions = requiredPermissions.every((permission) =>
          apiKey.permissions.includes(permission)
        );

        if (!hasPermissions) {
          return { isValid: false, reason: "Insufficient permissions" };
        }
      }

      // Check scopes
      if (requiredScopes && requiredScopes.length > 0) {
        const hasScopes = requiredScopes.every((scope) =>
          apiKey.scopes.includes(scope)
        );

        if (!hasScopes) {
          return { isValid: false, reason: "Insufficient scopes" };
        }
      }

      // Update usage tracking
      await this.updateUsage(apiKey.id);

      return { isValid: true, apiKey };
    } catch (error) {
      return { isValid: false, reason: `Validation error: ${error.message}` };
    }
  }

  // Check rate limiting for API key
  static async checkRateLimit(
    apiKeyId: UUID,
    ipAddress: string,
  ): Promise<{
    allowed: boolean;
    limit?: number;
    remaining?: number;
    resetTime?: number;
  }> {
    const apiKey = await this.getApiKey(apiKeyId);
    if (!apiKey || !apiKey.rateLimit) {
      return { allowed: true };
    }

    const { requests, window } = apiKey.rateLimit;
    const windowStart = Math.floor(Date.now() / (window * 1000)) *
      (window * 1000);
    const windowKey = `rate_limit:${apiKeyId}:${windowStart}`;

    const connection = db.getConnection();
    const currentUsage = await (connection.kv as Deno.Kv).get<number>([
      "rate_limits",
      windowKey,
    ]);

    const usage = currentUsage.value || 0;
    const remaining = Math.max(0, requests - usage - 1);
    const resetTime = windowStart + (window * 1000);

    if (usage >= requests) {
      return {
        allowed: false,
        limit: requests,
        remaining: 0,
        resetTime,
      };
    }

    // Increment usage
    await (connection.kv as Deno.Kv).set(
      ["rate_limits", windowKey],
      usage + 1,
      { expireIn: window * 1000 },
    );

    return {
      allowed: true,
      limit: requests,
      remaining,
      resetTime,
    };
  }

  // Get API key by ID
  static async getApiKey(apiKeyId: UUID): Promise<ApiKey | null> {
    const connection = db.getConnection();
    const result = await (connection.kv as Deno.Kv).get<ApiKey>(
      KeyPatterns.apiKeys.byId(apiKeyId),
    );
    return result.value || null;
  }

  // List API keys for user
  static async getUserApiKeys(userId: UUID): Promise<ApiKey[]> {
    const connection = db.getConnection();
    const keys: ApiKey[] = [];

    const iterator = (connection.kv as Deno.Kv).list<UUID>({
      prefix: KeyPatterns.apiKeys.byUserId(userId),
    });

    for await (const { value } of iterator) {
      if (value) {
        const apiKey = await this.getApiKey(value);
        if (apiKey) {
          keys.push(apiKey);
        }
      }
    }

    return keys.sort((a, b) => b.createdAt - a.createdAt);
  }

  // Update API key
  static async updateApiKey(
    apiKeyId: UUID,
    updates: Partial<
      Pick<
        ApiKey,
        | "name"
        | "permissions"
        | "scopes"
        | "expiresAt"
        | "rateLimit"
        | "ipWhitelist"
        | "isActive"
        | "metadata"
      >
    >,
    updatedBy: UUID,
  ): Promise<ApiKey | null> {
    const apiKey = await this.getApiKey(apiKeyId);
    if (!apiKey) {
      return null;
    }

    // Verify user has permission to update this key
    if (apiKey.userId !== updatedBy) {
      const userPermissions = await RBACManager.getUserPermissions(updatedBy);
      if (!userPermissions.includes("manage_all_api_keys")) {
        throw new Error("Cannot update API keys belonging to other users");
      }
    }

    const updatedApiKey: ApiKey = {
      ...apiKey,
      ...updates,
      updatedAt: Date.now(),
    };

    const connection = db.getConnection();
    await (connection.kv as Deno.Kv).set(
      KeyPatterns.apiKeys.byId(apiKeyId),
      updatedApiKey,
    );

    return updatedApiKey;
  }

  // Revoke API key
  static async revokeApiKey(apiKeyId: UUID, revokedBy: UUID): Promise<boolean> {
    const apiKey = await this.getApiKey(apiKeyId);
    if (!apiKey) {
      return false;
    }

    // Verify user has permission to revoke this key
    if (apiKey.userId !== revokedBy) {
      const userPermissions = await RBACManager.getUserPermissions(revokedBy);
      if (!userPermissions.includes("manage_all_api_keys")) {
        throw new Error("Cannot revoke API keys belonging to other users");
      }
    }

    const connection = db.getConnection();
    const atomic = (connection.kv as Deno.Kv).atomic();

    // Remove from all indexes
    atomic.delete(KeyPatterns.apiKeys.byId(apiKeyId));
    atomic.delete(KeyPatterns.apiKeys.byKey(apiKey.hashedKey));
    // Note: Keep in user index for audit purposes, but mark as inactive

    await atomic.commit();
    return true;
  }

  // Log API key usage
  static async logUsage(
    apiKeyId: UUID,
    endpoint: string,
    method: string,
    ipAddress: string,
    responseStatus: number,
    responseTime: number,
    userAgent?: string,
    payload?: { size: number; type: string },
  ): Promise<void> {
    const usageId = crypto.randomUUID();
    const usage: ApiKeyUsage = {
      id: usageId,
      apiKeyId,
      endpoint,
      method,
      ipAddress,
      userAgent,
      timestamp: Date.now(),
      responseStatus,
      responseTime,
      payload,
    };

    const connection = db.getConnection();
    await (connection.kv as Deno.Kv).set(
      ["api_usage", apiKeyId, usageId],
      usage,
    );
  }

  // Get usage statistics
  static async getUsageStats(
    apiKeyId: UUID,
    period: "hour" | "day" | "week" | "month" = "day",
  ): Promise<{
    totalRequests: number;
    successfulRequests: number;
    errorRequests: number;
    averageResponseTime: number;
    topEndpoints: Array<{ endpoint: string; count: number }>;
    requestsByStatus: Record<number, number>;
  }> {
    const connection = db.getConnection();
    const now = Date.now();
    const periodMs = {
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
    }[period];

    const since = now - periodMs;

    const iterator = (connection.kv as Deno.Kv).list<ApiKeyUsage>({
      prefix: ["api_usage", apiKeyId],
    });

    const usage: ApiKeyUsage[] = [];
    for await (const { value } of iterator) {
      if (value && value.timestamp >= since) {
        usage.push(value);
      }
    }

    const totalRequests = usage.length;
    const successfulRequests =
      usage.filter((u) => u.responseStatus >= 200 && u.responseStatus < 400)
        .length;
    const errorRequests = totalRequests - successfulRequests;
    const averageResponseTime = usage.length > 0
      ? usage.reduce((sum, u) => sum + u.responseTime, 0) / usage.length
      : 0;

    // Top endpoints
    const endpointCounts = new Map<string, number>();
    usage.forEach((u) => {
      endpointCounts.set(u.endpoint, (endpointCounts.get(u.endpoint) || 0) + 1);
    });

    const topEndpoints = Array.from(endpointCounts.entries())
      .map(([endpoint, count]) => ({ endpoint, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Requests by status
    const requestsByStatus: Record<number, number> = {};
    usage.forEach((u) => {
      requestsByStatus[u.responseStatus] =
        (requestsByStatus[u.responseStatus] || 0) + 1;
    });

    return {
      totalRequests,
      successfulRequests,
      errorRequests,
      averageResponseTime: Math.round(averageResponseTime),
      topEndpoints,
      requestsByStatus,
    };
  }

  // Private helper methods
  private static generateApiKey(): string {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const randomPart = Array.from(
      { length: this.KEY_LENGTH },
      () => chars[Math.floor(Math.random() * chars.length)],
    ).join("");

    return `${this.KEY_PREFIX}${randomPart}`;
  }

  private static extractPrefix(key: string): string {
    return key.substring(0, this.KEY_PREFIX.length + 8);
  }

  private static async hashApiKey(key: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(key);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  private static async validatePermissions(
    requestedPermissions: Permission[],
    userPermissions: Permission[],
  ): Promise<boolean> {
    // User must have all requested permissions to grant them
    return requestedPermissions.every((permission) =>
      userPermissions.includes(permission)
    );
  }

  private static async updateUsage(apiKeyId: UUID): Promise<void> {
    const apiKey = await this.getApiKey(apiKeyId);
    if (!apiKey) return;

    const updatedApiKey: ApiKey = {
      ...apiKey,
      lastUsedAt: Date.now(),
      usageCount: apiKey.usageCount + 1,
    };

    const connection = db.getConnection();
    await (connection.kv as Deno.Kv).set(
      KeyPatterns.apiKeys.byId(apiKeyId),
      updatedApiKey,
    );
  }

  // Get all API keys (admin function)
  static async getAllApiKeys(adminUserId: UUID): Promise<ApiKey[]> {
    const userPermissions = await RBACManager.getUserPermissions(adminUserId);
    if (!userPermissions.includes("manage_all_api_keys")) {
      throw new Error("Insufficient permissions to view all API keys");
    }

    const connection = db.getConnection();
    const keys: ApiKey[] = [];

    const iterator = (connection.kv as Deno.Kv).list<ApiKey>({
      prefix: KeyPatterns.apiKeys.all(),
    });

    for await (const { value } of iterator) {
      if (value) {
        keys.push(value);
      }
    }

    return keys.sort((a, b) => b.createdAt - a.createdAt);
  }
}

export default ApiKeyManager;
