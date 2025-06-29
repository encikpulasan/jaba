// Demo API Key Validation
// Simple route to test API key validation

import { Handlers } from "$fresh/server.ts";

export const handler: Handlers = {
  // POST /api/demo/validate-key - Validate an API key
  async POST(req) {
    try {
      // Get API key from Authorization header or body
      const authHeader = req.headers.get("Authorization");
      const body = await req.json().catch(() => ({}));

      let apiKey: string | null = null;

      if (authHeader?.startsWith("Bearer ")) {
        apiKey = authHeader.substring(7);
      } else if (body.apiKey) {
        apiKey = body.apiKey;
      }

      if (!apiKey) {
        return new Response(
          JSON.stringify({
            success: false,
            error:
              "API key required in Authorization header (Bearer token) or request body",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Validate API key format
      if (!apiKey.startsWith("masa_")) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid API key format. Must start with 'masa_'",
          }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // In production, this would check against the database
      // For demo, we'll just validate the format and return success
      const isValid = apiKey.length > 37; // masa_ + 32 characters

      if (isValid) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              valid: true,
              keyInfo: {
                prefix: apiKey.substring(0, 13),
                format: "valid",
                type: "bearer_token",
              },
            },
            message: "API key is valid",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      } else {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid API key",
          }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "API key validation failed",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};
