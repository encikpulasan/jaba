// Media API Routes
// RESTful endpoints for media file management

import { Handlers } from "$fresh/server.ts";
import { mediaService } from "@/lib/media/service.ts";
import { getAuthContext } from "@/lib/auth/middleware.ts";
import type { MediaFile, UUID } from "@/types";

// POST /api/media - Upload media file
export const POST: Handlers = {
  async POST(req) {
    try {
      // Get authentication context
      const authContext = await getAuthContext(req);
      if (!authContext) {
        return new Response(
          JSON.stringify({ error: "Authentication required" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }

      // Extract user and permissions based on auth type
      let userId: UUID;
      let permissions: string[];

      if ("user" in authContext) {
        // JWT auth
        userId = authContext.user.id;
        permissions = authContext.permissions;
      } else {
        // API key auth
        userId = authContext.apiKey.userId;
        permissions = authContext.apiKey.permissions;
      }

      // Parse multipart form data
      const formData = await req.formData();
      const file = formData.get("file") as File;
      const folder = formData.get("folder") as string | null;
      const alt = formData.get("alt") as string | null;
      const caption = formData.get("caption") as string | null;
      const tags = formData.get("tags") as string | null;

      if (!file) {
        return new Response(
          JSON.stringify({ error: "No file provided" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      // Parse tags if provided
      const tagArray = tags ? tags.split(",").map((t) => t.trim()) : [];

      // Upload file
      const result = await mediaService.uploadFile(
        file,
        file.name,
        userId,
        permissions as any,
        {
          folder: folder || undefined,
          alt: alt || undefined,
          caption: caption || undefined,
          tags: tagArray,
          generateThumbnail: true,
          maxSize: 50 * 1024 * 1024, // 50MB max
        },
      );

      return new Response(
        JSON.stringify({
          success: true,
          data: result,
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("Media upload error:", error);
      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Upload failed",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  },
};

// GET /api/media - List media files
export const GET: Handlers = {
  async GET(req) {
    try {
      // Get authentication context
      const authContext = await getAuthContext(req);
      if (!authContext) {
        return new Response(
          JSON.stringify({ error: "Authentication required" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }

      // Extract permissions based on auth type
      let permissions: string[];

      if ("user" in authContext) {
        // JWT auth
        permissions = authContext.permissions;
      } else {
        // API key auth
        permissions = authContext.apiKey.permissions;
      }

      // Parse query parameters
      const url = new URL(req.url);
      const folder = url.searchParams.get("folder") || undefined;
      const type = url.searchParams.get("type") || undefined;
      const search = url.searchParams.get("search") || undefined;
      const tags = url.searchParams.get("tags")?.split(",") || undefined;
      const limit = parseInt(url.searchParams.get("limit") || "20");
      const offset = parseInt(url.searchParams.get("offset") || "0");

      // Get media files
      const result = await mediaService.listMedia(
        {
          folder,
          type,
          search,
          tags,
          limit,
          offset,
        },
        permissions as any,
      );

      return new Response(
        JSON.stringify({
          success: true,
          data: result,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("Media list error:", error);
      return new Response(
        JSON.stringify({
          error: error instanceof Error
            ? error.message
            : "Failed to list media",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  },
};
