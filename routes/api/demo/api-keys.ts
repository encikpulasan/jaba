// Demo API Key Management
// Simple route to test API key functionality

import { Handlers } from "$fresh/server.ts";

// Simple API key structure for demo
interface DemoApiKey {
  id: string;
  name: string;
  key: string;
  prefix: string;
  permissions: string[];
  createdAt: number;
  isActive: boolean;
}

// In-memory storage for demo (use KV in production)
const demoApiKeys = new Map<string, DemoApiKey>();

export const handler: Handlers = {
  // POST /api/demo/api-keys - Create demo API key
  async POST(req) {
    try {
      const body = await req.json();
      const { name, permissions = [] } = body;

      if (!name) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Name is required",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Generate simple API key
      const keyId = crypto.randomUUID();
      const plainKey = `masa_${
        Array.from(
          { length: 32 },
          () =>
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[
              Math.floor(Math.random() * 62)
            ],
        ).join("")
      }`;

      const apiKey: DemoApiKey = {
        id: keyId,
        name,
        key: plainKey.substring(0, 8) + "...", // Display version
        prefix: plainKey.substring(0, 13),
        permissions,
        createdAt: Date.now(),
        isActive: true,
      };

      // Store in demo storage
      demoApiKeys.set(keyId, apiKey);

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            apiKey: {
              ...apiKey,
              fullKey: plainKey, // Only shown once
            },
          },
          message: "Demo API key created successfully",
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to create demo API key",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },

  // GET /api/demo/api-keys - List demo API keys
  async GET() {
    try {
      const keys = Array.from(demoApiKeys.values());

      return new Response(
        JSON.stringify({
          success: true,
          data: keys,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to fetch demo API keys",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};
