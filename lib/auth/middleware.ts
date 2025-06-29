// Authentication middleware for Fresh framework
// Handles JWT validation and API key authentication

import type { Permission, UUID } from "@/types";
import { AuthService } from "./service.ts";
import { RBACManager } from "./rbac.ts";
import { ApiKeyManager } from "./api-keys.ts";

// Connection info interface for middleware
interface ConnInfo {
  remoteAddr: {
    hostname: string;
    port: number;
  };
}

// Extend Fresh context with auth data
export interface AuthContext {
  user: {
    id: UUID;
    username: string;
    email: string;
    isActive: boolean;
  };
  session: {
    id: UUID;
    expiresAt: number;
  };
  permissions: Permission[];
  authType: "jwt";
}

// API Key Authentication Context
export interface ApiKeyAuthContext {
  apiKey: {
    id: UUID;
    name: string;
    userId: UUID;
    permissions: Permission[];
    scopes: string[];
    rateLimit?: {
      requests: number;
      window: number;
    };
  };
  authType: "api_key";
}

// Authentication middleware
export function createAuthMiddleware(requiredPermissions?: Permission[]) {
  return async (
    req: Request,
    info: ConnInfo,
    next: () => Response | Promise<Response>,
  ) => {
    try {
      // Get the JWT token from Authorization header
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response("Missing or invalid authorization header", {
          status: 401,
        });
      }

      const token = authHeader.substring(7);

      // Skip API key tokens
      if (token.startsWith("masa_")) {
        return new Response("Use API key authentication endpoint", {
          status: 401,
        });
      }

      // Validate JWT token
      const validation = await AuthService.validateToken(token);
      if (!validation.isValid || !validation.payload) {
        return new Response("Invalid or expired token", { status: 401 });
      }

      // Get user permissions
      const userPermissions = await RBACManager.getUserPermissions(
        validation.payload.sub,
      );

      // Check required permissions
      if (requiredPermissions && requiredPermissions.length > 0) {
        const hasPermissions = requiredPermissions.every((permission) =>
          userPermissions.includes(permission)
        );

        if (!hasPermissions) {
          return new Response("Insufficient permissions", { status: 403 });
        }
      }

      // Create auth context
      const authContext: AuthContext = {
        user: {
          id: validation.payload.sub,
          username: validation.payload.username || "",
          email: validation.payload.email || "",
          isActive: validation.payload.isActive || false,
        },
        session: {
          id: validation.payload.sessionId || "",
          expiresAt: validation.payload.exp * 1000,
        },
        permissions: userPermissions,
        authType: "jwt",
      };

      // Set context for the request
      req.headers.set("X-Auth-Context", JSON.stringify(authContext));

      return await next();
    } catch (error) {
      console.error("Authentication error:", error);
      return new Response("Authentication error", { status: 500 });
    }
  };
}

// API Key Authentication Middleware
export function createApiKeyAuthMiddleware(options?: {
  requiredPermissions?: Permission[];
  requiredScopes?: string[];
  checkRateLimit?: boolean;
}) {
  return async (
    req: Request,
    info: ConnInfo,
    next: () => Response | Promise<Response>,
  ) => {
    try {
      // Extract API key from Authorization header
      const authHeader = req.headers.get("Authorization");
      let apiKey: string | null = null;

      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        // Check if it's an API key (starts with masa_) or JWT
        if (token.startsWith("masa_")) {
          apiKey = token;
        }
      }

      // Also check for API key in X-API-Key header
      if (!apiKey) {
        apiKey = req.headers.get("X-API-Key");
      }

      if (!apiKey) {
        return new Response("API key required", { status: 401 });
      }

      // Validate API key
      const validation = await ApiKeyManager.validateApiKey(
        apiKey,
        options?.requiredPermissions,
        options?.requiredScopes,
      );

      if (!validation.isValid || !validation.apiKey) {
        return new Response(`Authentication failed: ${validation.reason}`, {
          status: 401,
        });
      }

      // Check rate limiting if enabled
      if (options?.checkRateLimit !== false) {
        const rateLimit = await ApiKeyManager.checkRateLimit(
          validation.apiKey.id,
          info.remoteAddr.hostname,
        );

        if (!rateLimit.allowed) {
          const response = new Response("Rate limit exceeded", { status: 429 });
          if (rateLimit.limit) {
            response.headers.set(
              "X-RateLimit-Limit",
              rateLimit.limit.toString(),
            );
            response.headers.set("X-RateLimit-Remaining", "0");
            response.headers.set(
              "X-RateLimit-Reset",
              Math.ceil(rateLimit.resetTime! / 1000).toString(),
            );
          }
          return response;
        }

        // Add rate limit headers to response
        const response = await next();
        if (rateLimit.limit) {
          response.headers.set("X-RateLimit-Limit", rateLimit.limit.toString());
          response.headers.set(
            "X-RateLimit-Remaining",
            rateLimit.remaining?.toString() || "0",
          );
          response.headers.set(
            "X-RateLimit-Reset",
            Math.ceil(rateLimit.resetTime! / 1000).toString(),
          );
        }
        return response;
      }

      // Create API key auth context
      const apiKeyContext: ApiKeyAuthContext = {
        apiKey: {
          id: validation.apiKey.id,
          name: validation.apiKey.name,
          userId: validation.apiKey.userId,
          permissions: validation.apiKey.permissions,
          scopes: validation.apiKey.scopes,
          rateLimit: validation.apiKey.rateLimit,
        },
        authType: "api_key",
      };

      // Set context for the request
      req.headers.set("X-Auth-Context", JSON.stringify(apiKeyContext));

      const response = await next();

      // Log API usage
      const url = new URL(req.url);
      await ApiKeyManager.logUsage(
        validation.apiKey.id,
        url.pathname,
        req.method,
        info.remoteAddr.hostname,
        response.status,
        Date.now(),
        req.headers.get("User-Agent") || undefined,
      );

      return response;
    } catch (error) {
      console.error("API key authentication error:", error);
      return new Response("Authentication error", { status: 500 });
    }
  };
}

// Combined Authentication Middleware (JWT or API Key)
export function createCombinedAuthMiddleware(options?: {
  requiredPermissions?: Permission[];
  requiredScopes?: string[];
  checkRateLimit?: boolean;
}) {
  return async (
    req: Request,
    info: ConnInfo,
    next: () => Response | Promise<Response>,
  ) => {
    const authHeader = req.headers.get("Authorization");
    const apiKeyHeader = req.headers.get("X-API-Key");

    // Determine authentication type
    if (
      apiKeyHeader ||
      (authHeader?.startsWith("Bearer ") &&
        authHeader.substring(7).startsWith("masa_"))
    ) {
      // Use API key authentication
      return createApiKeyAuthMiddleware(options)(req, info, next);
    } else if (authHeader?.startsWith("Bearer ")) {
      // Use JWT authentication
      return createAuthMiddleware(options?.requiredPermissions)(
        req,
        info,
        next,
      );
    } else {
      return new Response("Authentication required", { status: 401 });
    }
  };
}

// Helper function to get auth context from request
export function getAuthContext(
  req: Request,
): AuthContext | ApiKeyAuthContext | null {
  const contextHeader = req.headers.get("X-Auth-Context");
  if (!contextHeader) {
    return null;
  }

  try {
    return JSON.parse(contextHeader);
  } catch {
    return null;
  }
}

// Helper function to check permission
export function hasPermission(
  context: AuthContext | ApiKeyAuthContext | null,
  permission: Permission,
): boolean {
  if (!context) return false;

  if (context.authType === "jwt") {
    return context.permissions.includes(permission);
  } else if (context.authType === "api_key") {
    return context.apiKey.permissions.includes(permission);
  }

  return false;
}

// Helper function to check role
export async function hasRole(
  req: Request,
  role: string,
): Promise<boolean> {
  const authContext = getAuthContext(req);
  if (!authContext) {
    return false;
  }

  const userId = getUserId(authContext);
  if (!userId) {
    return false;
  }

  return await RBACManager.userHasRole(userId, role);
}

// Helper function to get user ID from either auth type
export function getUserId(
  context: AuthContext | ApiKeyAuthContext | null,
): UUID | null {
  if (!context) return null;

  if (context.authType === "jwt") {
    return context.user.id;
  } else if (context.authType === "api_key") {
    return context.apiKey.userId;
  }

  return null;
}
