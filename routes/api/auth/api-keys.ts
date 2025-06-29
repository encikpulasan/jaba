// API Key Management Routes
// REST endpoints for managing API keys

import { Handlers } from "$fresh/server.ts";
import { z } from "zod";
import {
  ApiKeyManager,
  type CreateApiKeyRequest,
} from "@/lib/auth/api-keys.ts";
import { createAuthMiddleware, getAuthContext } from "@/lib/auth/middleware.ts";
import type { Permission } from "@/types";

// Validation schemas
const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  permissions: z.array(z.string()),
  scopes: z.array(z.string()).optional(),
  expiresAt: z.number().optional(),
  rateLimit: z.object({
    requests: z.number().min(1).max(10000),
    window: z.number().min(1).max(3600),
  }).optional(),
  ipWhitelist: z.array(z.string()).optional(),
  environment: z.enum(["development", "staging", "production", "all"])
    .optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateApiKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  permissions: z.array(z.string()).optional(),
  scopes: z.array(z.string()).optional(),
  expiresAt: z.number().optional(),
  rateLimit: z.object({
    requests: z.number().min(1).max(10000),
    window: z.number().min(1).max(3600),
  }).optional(),
  ipWhitelist: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const handler: Handlers = {
  // GET /api/auth/api-keys - List user's API keys
  async GET(req, ctx) {
    const authMiddleware = createAuthMiddleware(["manage_api_keys"]);

    return await authMiddleware(req, ctx.info, async () => {
      try {
        const authContext = getAuthContext(req);
        if (!authContext || authContext.authType !== "jwt") {
          return new Response("Invalid authentication", { status: 401 });
        }

        const userId = authContext.user.id;
        const apiKeys = await ApiKeyManager.getUserApiKeys(userId);

        return new Response(
          JSON.stringify({
            success: true,
            data: apiKeys.map((key) => ({
              ...key,
              hashedKey: undefined, // Never return hashed key
            })),
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      } catch (error) {
        console.error("Error fetching API keys:", error);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to fetch API keys",
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    });
  },

  // POST /api/auth/api-keys - Create new API key
  async POST(req, ctx) {
    const authMiddleware = createAuthMiddleware(["manage_api_keys"]);

    return await authMiddleware(req, ctx.info, async () => {
      try {
        const authContext = getAuthContext(req);
        if (!authContext || authContext.authType !== "jwt") {
          return new Response("Invalid authentication", { status: 401 });
        }

        const body = await req.json();
        const validatedData = createApiKeySchema.parse(body);

        const userId = authContext.user.id;
        const { apiKey, plainKey } = await ApiKeyManager.createApiKey(
          userId,
          validatedData as CreateApiKeyRequest,
        );

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              apiKey: {
                ...apiKey,
                hashedKey: undefined, // Never return hashed key
              },
              key: plainKey, // Return plain key only once
            },
            message:
              "API key created successfully. Save the key securely - it won't be shown again.",
          }),
          {
            status: 201,
            headers: { "Content-Type": "application/json" },
          },
        );
      } catch (error) {
        console.error("Error creating API key:", error);
        return new Response(
          JSON.stringify({
            success: false,
            error: error.message || "Failed to create API key",
          }),
          {
            status: error.message?.includes("permissions") ? 403 : 500,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    });
  },
};

// Individual API key routes
export const keyHandler: Handlers = {
  // GET /api/auth/api-keys/[id] - Get specific API key
  async GET(req, ctx) {
    const authMiddleware = createAuthMiddleware(["manage_api_keys"]);

    return await authMiddleware(req, ctx.info, async () => {
      try {
        const keyId = ctx.params.id;
        const apiKey = await ApiKeyManager.getApiKey(keyId);

        if (!apiKey) {
          return new Response(
            JSON.stringify({
              success: false,
              error: "API key not found",
            }),
            {
              status: 404,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        const authContext = getAuthContext(req);
        if (!authContext || authContext.authType !== "jwt") {
          return new Response("Invalid authentication", { status: 401 });
        }

        // Check if user owns this key or has admin permissions
        const userId = authContext.user.id;
        if (
          apiKey.userId !== userId &&
          !authContext.permissions.includes("manage_all_api_keys")
        ) {
          return new Response(
            JSON.stringify({
              success: false,
              error: "Access denied",
            }),
            {
              status: 403,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              ...apiKey,
              hashedKey: undefined, // Never return hashed key
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      } catch (error) {
        console.error("Error fetching API key:", error);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to fetch API key",
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    });
  },

  // PUT /api/auth/api-keys/[id] - Update API key
  async PUT(req, ctx) {
    const authMiddleware = createAuthMiddleware(["manage_api_keys"]);

    return await authMiddleware(req, ctx.info, async () => {
      try {
        const keyId = ctx.params.id;
        const body = await req.json();
        const validatedData = updateApiKeySchema.parse(body);

        const authContext = getAuthContext(req);
        if (!authContext || authContext.authType !== "jwt") {
          return new Response("Invalid authentication", { status: 401 });
        }

        const userId = authContext.user.id;
        const updatedKey = await ApiKeyManager.updateApiKey(
          keyId,
          validatedData,
          userId,
        );

        if (!updatedKey) {
          return new Response(
            JSON.stringify({
              success: false,
              error: "API key not found",
            }),
            {
              status: 404,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              ...updatedKey,
              hashedKey: undefined, // Never return hashed key
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      } catch (error) {
        console.error("Error updating API key:", error);
        return new Response(
          JSON.stringify({
            success: false,
            error: error.message || "Failed to update API key",
          }),
          {
            status: error.message?.includes("Cannot update") ? 403 : 500,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    });
  },

  // DELETE /api/auth/api-keys/[id] - Revoke API key
  async DELETE(req, ctx) {
    const authMiddleware = createAuthMiddleware(["manage_api_keys"]);

    return await authMiddleware(req, ctx.info, async () => {
      try {
        const keyId = ctx.params.id;
        const authContext = getAuthContext(req);

        if (!authContext || authContext.authType !== "jwt") {
          return new Response("Invalid authentication", { status: 401 });
        }

        const userId = authContext.user.id;
        const success = await ApiKeyManager.revokeApiKey(keyId, userId);

        if (!success) {
          return new Response(
            JSON.stringify({
              success: false,
              error: "API key not found",
            }),
            {
              status: 404,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: "API key revoked successfully",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      } catch (error) {
        console.error("Error revoking API key:", error);
        return new Response(
          JSON.stringify({
            success: false,
            error: error.message || "Failed to revoke API key",
          }),
          {
            status: error.message?.includes("Cannot revoke") ? 403 : 500,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    });
  },
};

// Usage statistics routes
export const usageHandler: Handlers = {
  // GET /api/auth/api-keys/[id]/usage - Get API key usage statistics
  async GET(req, ctx) {
    const authMiddleware = createAuthMiddleware(["manage_api_keys"]);

    return await authMiddleware(req, ctx.info, async () => {
      try {
        const keyId = ctx.params.id;
        const url = new URL(req.url);
        const period =
          url.searchParams.get("period") as "hour" | "day" | "week" | "month" ||
          "day";

        const apiKey = await ApiKeyManager.getApiKey(keyId);
        if (!apiKey) {
          return new Response(
            JSON.stringify({
              success: false,
              error: "API key not found",
            }),
            {
              status: 404,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        const authContext = getAuthContext(req);
        if (!authContext || authContext.authType !== "jwt") {
          return new Response("Invalid authentication", { status: 401 });
        }

        // Check if user owns this key or has admin permissions
        const userId = authContext.user.id;
        if (
          apiKey.userId !== userId &&
          !authContext.permissions.includes("manage_all_api_keys")
        ) {
          return new Response(
            JSON.stringify({
              success: false,
              error: "Access denied",
            }),
            {
              status: 403,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        const stats = await ApiKeyManager.getUsageStats(keyId, period);

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              period,
              stats,
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      } catch (error) {
        console.error("Error fetching usage stats:", error);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to fetch usage statistics",
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    });
  },
};
