// Content API Routes
// RESTful API for content management with authentication and permissions

import { FreshContext } from "$fresh/server.ts";
import { contentService } from "@/lib/content/service.ts";
import { getAuthContext } from "@/lib/auth/middleware.ts";
import type { Content, UUID } from "@/types";

// GET /api/content - List content with filtering and pagination
export async function GET(req: Request, ctx: FreshContext) {
  try {
    const url = new URL(req.url);
    const authContext = await getAuthContext(req);

    if (!authContext) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Parse query parameters
    const contentType = url.searchParams.get("type");
    const locale = url.searchParams.get("locale");
    const status = url.searchParams.get("status");
    const author = url.searchParams.get("author");
    const tags = url.searchParams.get("tags")?.split(",");
    const categories = url.searchParams.get("categories")?.split(",");
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const sortBy = url.searchParams.get("sortBy") || "createdAt";
    const sortOrder = url.searchParams.get("sortOrder") || "desc";

    const options = {
      contentType: contentType || undefined,
      locale: locale || undefined,
      status: status || undefined,
      author: author || undefined,
      tags: tags || undefined,
      categories: categories || undefined,
      limit,
      offset,
      sortBy,
      sortOrder,
    };

    // Get permissions based on auth type
    const permissions = authContext.authType === "jwt"
      ? authContext.permissions
      : authContext.apiKey.permissions;

    const result = await contentService.listContent(
      options,
      permissions,
    );

    return new Response(
      JSON.stringify({
        success: true,
        data: result.content,
        meta: {
          total: result.total,
          limit,
          offset,
          hasMore: result.hasMore,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Content list error:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to fetch content",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

// POST /api/content - Create new content
export async function POST(req: Request, ctx: FreshContext) {
  try {
    const authContext = await getAuthContext(req);

    if (!authContext) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const body = await req.json();

    // Validate required fields
    if (!body.title) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          message: "Title is required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (!body.contentType) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          message: "Content type is required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (!body.locale) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          message: "Locale is required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Get user ID and permissions based on auth type
    const userId = authContext.authType === "jwt"
      ? authContext.user.id
      : authContext.apiKey.userId;

    const permissions = authContext.authType === "jwt"
      ? authContext.permissions
      : authContext.apiKey.permissions;

    const content = await contentService.createContent(
      body,
      userId,
      permissions,
    );

    return new Response(
      JSON.stringify({
        success: true,
        data: content,
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Content creation error:", error);

    const errorMessage = error instanceof Error
      ? error.message
      : "Unknown error";

    if (errorMessage.includes("Insufficient permissions")) {
      return new Response(
        JSON.stringify({
          error: "Permission denied",
          message: errorMessage,
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        error: "Failed to create content",
        message: errorMessage,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
