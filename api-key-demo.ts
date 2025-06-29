#!/usr/bin/env -S deno run --allow-all

// API Key Management Demo
// Standalone demonstration of the API key system

interface ApiKey {
  id: string;
  name: string;
  key: string;
  prefix: string;
  hashedKey: string;
  permissions: string[];
  scopes: string[];
  expiresAt?: number;
  lastUsedAt?: number;
  usageCount: number;
  rateLimit?: {
    requests: number;
    window: number;
  };
  ipWhitelist?: string[];
  environment: "development" | "staging" | "production" | "all";
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

class ApiKeyManager {
  private static readonly KEY_PREFIX = "masa_";
  private static readonly KEY_LENGTH = 32;
  private static apiKeys = new Map<string, ApiKey>();

  // Generate new API key
  static generateApiKey(): string {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const randomPart = Array.from(
      { length: this.KEY_LENGTH },
      () => chars[Math.floor(Math.random() * chars.length)],
    ).join("");

    return `${this.KEY_PREFIX}${randomPart}`;
  }

  // Hash API key (simplified for demo)
  static async hashApiKey(key: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(key);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Create API key
  static async createApiKey(request: {
    name: string;
    permissions: string[];
    scopes?: string[];
    expiresAt?: number;
    rateLimit?: { requests: number; window: number };
    environment?: "development" | "staging" | "production" | "all";
  }): Promise<{ apiKey: ApiKey; plainKey: string }> {
    const keyId = crypto.randomUUID();
    const plainKey = this.generateApiKey();
    const hashedKey = await this.hashApiKey(plainKey);
    const prefix = plainKey.substring(0, this.KEY_PREFIX.length + 8);
    const now = Date.now();

    const apiKey: ApiKey = {
      id: keyId,
      name: request.name,
      key: plainKey.substring(0, 8) + "...", // Store truncated version for display
      prefix,
      hashedKey,
      permissions: request.permissions,
      scopes: request.scopes || [],
      expiresAt: request.expiresAt,
      usageCount: 0,
      rateLimit: request.rateLimit,
      environment: request.environment || "all",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    // Store API key (in memory for demo)
    this.apiKeys.set(keyId, apiKey);

    return { apiKey, plainKey };
  }

  // Validate API key
  static async validateApiKey(
    key: string,
    requiredPermissions?: string[],
    requiredScopes?: string[],
  ): Promise<{
    isValid: boolean;
    apiKey?: ApiKey;
    reason?: string;
  }> {
    try {
      const hashedKey = await this.hashApiKey(key);

      // Find API key by hashed key
      let foundApiKey: ApiKey | undefined;
      for (const apiKey of this.apiKeys.values()) {
        if (apiKey.hashedKey === hashedKey) {
          foundApiKey = apiKey;
          break;
        }
      }

      if (!foundApiKey) {
        return { isValid: false, reason: "API key not found" };
      }

      // Check if key is active
      if (!foundApiKey.isActive) {
        return { isValid: false, reason: "API key is disabled" };
      }

      // Check expiration
      if (foundApiKey.expiresAt && Date.now() > foundApiKey.expiresAt) {
        return { isValid: false, reason: "API key has expired" };
      }

      // Check permissions
      if (requiredPermissions && requiredPermissions.length > 0) {
        const hasPermissions = requiredPermissions.every((permission) =>
          foundApiKey!.permissions.includes(permission)
        );

        if (!hasPermissions) {
          return { isValid: false, reason: "Insufficient permissions" };
        }
      }

      // Check scopes
      if (requiredScopes && requiredScopes.length > 0) {
        const hasScopes = requiredScopes.every((scope) =>
          foundApiKey!.scopes.includes(scope)
        );

        if (!hasScopes) {
          return { isValid: false, reason: "Insufficient scopes" };
        }
      }

      // Update usage tracking
      foundApiKey.lastUsedAt = Date.now();
      foundApiKey.usageCount++;

      return { isValid: true, apiKey: foundApiKey };
    } catch (error) {
      return { isValid: false, reason: `Validation error: ${error.message}` };
    }
  }

  // List all API keys
  static listApiKeys(): ApiKey[] {
    return Array.from(this.apiKeys.values()).sort((a, b) =>
      b.createdAt - a.createdAt
    );
  }

  // Get API key by ID
  static getApiKey(keyId: string): ApiKey | undefined {
    return this.apiKeys.get(keyId);
  }

  // Revoke API key
  static revokeApiKey(keyId: string): boolean {
    const apiKey = this.apiKeys.get(keyId);
    if (apiKey) {
      apiKey.isActive = false;
      apiKey.updatedAt = Date.now();
      return true;
    }
    return false;
  }
}

// Demo function
async function demoApiKeyManagement() {
  console.log("🔑 API Key Management Demo\n");

  // 1. Create API keys
  console.log("1. Creating API keys...");

  const { apiKey: key1, plainKey: plainKey1 } = await ApiKeyManager
    .createApiKey({
      name: "Frontend App Key",
      permissions: ["read_content", "create_content"],
      scopes: ["api:read", "api:write"],
      rateLimit: { requests: 1000, window: 3600 },
      environment: "production",
    });

  const { apiKey: key2, plainKey: plainKey2 } = await ApiKeyManager
    .createApiKey({
      name: "Analytics Service Key",
      permissions: ["read_content", "view_analytics"],
      scopes: ["api:read"],
      expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days
      environment: "production",
    });

  const { apiKey: key3, plainKey: plainKey3 } = await ApiKeyManager
    .createApiKey({
      name: "Development Key",
      permissions: ["read_content", "create_content", "edit_content"],
      scopes: ["api:read", "api:write", "api:admin"],
      environment: "development",
    });

  console.log("✅ Created API keys:");
  console.log(`   - ${key1.name}: ${key1.prefix}... (${plainKey1})`);
  console.log(`   - ${key2.name}: ${key2.prefix}... (${plainKey2})`);
  console.log(`   - ${key3.name}: ${key3.prefix}... (${plainKey3})`);
  console.log();

  // 2. List API keys
  console.log("2. Listing all API keys...");
  const allKeys = ApiKeyManager.listApiKeys();
  console.log(`✅ Found ${allKeys.length} API keys:`);
  allKeys.forEach((key) => {
    console.log(
      `   - ${key.name} (${key.prefix}...): ${
        key.permissions.join(", ")
      } [${key.environment}]`,
    );
  });
  console.log();

  // 3. Validate API keys
  console.log("3. Validating API keys...");

  // Valid key with permissions
  const validation1 = await ApiKeyManager.validateApiKey(
    plainKey1,
    ["read_content"],
    ["api:read"],
  );
  console.log(
    `✅ Key validation (${key1.prefix}...):`,
    validation1.isValid ? "VALID" : `INVALID - ${validation1.reason}`,
  );

  // Valid key but insufficient permissions
  const validation2 = await ApiKeyManager.validateApiKey(
    plainKey2,
    ["create_content"], // This key doesn't have create permission
    ["api:write"],
  );
  console.log(
    `❌ Key validation (${key2.prefix}...):`,
    validation2.isValid ? "VALID" : `INVALID - ${validation2.reason}`,
  );

  // Invalid key
  const validation3 = await ApiKeyManager.validateApiKey(
    "masa_invalidkey123456789012345678",
    ["read_content"],
  );
  console.log(
    `❌ Invalid key validation:`,
    validation3.isValid ? "VALID" : `INVALID - ${validation3.reason}`,
  );
  console.log();

  // 4. Usage tracking
  console.log("4. Usage tracking...");
  console.log(`📊 ${key1.name} usage count: ${key1.usageCount}`);
  console.log(`📊 ${key2.name} usage count: ${key2.usageCount}`);
  console.log(`📊 ${key3.name} usage count: ${key3.usageCount}`);
  console.log();

  // 5. Revoke API key
  console.log("5. Revoking API key...");
  const revoked = ApiKeyManager.revokeApiKey(key3.id);
  console.log(`🗑️  Revoked ${key3.name}:`, revoked ? "SUCCESS" : "FAILED");

  // Try to use revoked key
  const validation4 = await ApiKeyManager.validateApiKey(plainKey3);
  console.log(
    `❌ Revoked key validation:`,
    validation4.isValid ? "VALID" : `INVALID - ${validation4.reason}`,
  );
  console.log();

  // 6. Rate limiting demo
  console.log("6. Rate limiting info...");
  allKeys.forEach((key) => {
    if (key.rateLimit) {
      console.log(
        `🚦 ${key.name}: ${key.rateLimit.requests} requests per ${key.rateLimit.window}s`,
      );
    } else {
      console.log(`🚦 ${key.name}: No rate limit`);
    }
  });
  console.log();

  console.log("🎉 API Key Management Demo Complete!");
  console.log("\n📝 Summary:");
  console.log("   - Created 3 API keys with different permissions and scopes");
  console.log("   - Validated keys with permission checking");
  console.log("   - Demonstrated usage tracking");
  console.log("   - Showed key revocation");
  console.log("   - Displayed rate limiting configuration");
  console.log("\n🔧 Next Steps:");
  console.log("   - Integrate with Deno KV for persistence");
  console.log("   - Add user authentication middleware");
  console.log("   - Implement rate limiting enforcement");
  console.log("   - Add API usage analytics");
  console.log("   - Create admin dashboard for key management");
}

// Run the demo
if (import.meta.main) {
  await demoApiKeyManagement();
}
