// GraphQL Resolvers
// Comprehensive resolvers for masmaCMS GraphQL API

import { GraphQLScalarType } from "graphql";
import { GraphQLUpload } from "graphql-scalars";
import { contentService } from "@/lib/content/service.ts";
import { mediaService } from "@/lib/media/service.ts";
import { ApiKeyManager } from "@/lib/auth/api-keys.ts";
import { getAuthContext } from "@/lib/auth/middleware.ts";
import type {
  ApiKey,
  Content,
  MediaFile,
  Permission,
  User,
  UUID,
} from "@/types";

// Custom scalar resolvers
const DateTimeScalar = new GraphQLScalarType({
  name: "DateTime",
  description: "ISO 8601 DateTime custom scalar type",
  serialize: (value: unknown) => {
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === "number") {
      return new Date(value).toISOString();
    }
    if (typeof value === "string") {
      return new Date(value).toISOString();
    }
    throw new Error("Value must be a Date object, number, or string");
  },
  parseValue: (value: unknown) => {
    if (typeof value === "string") {
      return new Date(value);
    }
    throw new Error("Value must be a string");
  },
  parseLiteral: (ast: any) => {
    if (ast.kind === "StringValue") {
      return new Date(ast.value);
    }
    throw new Error("Can only parse strings to dates");
  },
});

const JSONScalar = new GraphQLScalarType({
  name: "JSON",
  description: "JSON custom scalar type",
  serialize: (value: unknown) => value,
  parseValue: (value: unknown) => value,
  parseLiteral: (ast: any) => {
    switch (ast.kind) {
      case "StringValue":
        return JSON.parse(ast.value);
      case "BooleanValue":
        return ast.value;
      case "IntValue":
        return parseInt(ast.value, 10);
      case "FloatValue":
        return parseFloat(ast.value);
      case "ObjectValue":
        return ast.fields.reduce((value: any, field: any) => {
          value[field.name.value] = JSONScalar.parseLiteral!(field.value, {});
          return value;
        }, {});
      case "ListValue":
        return ast.values.map((n: any) => JSONScalar.parseLiteral!(n, {}));
      default:
        return null;
    }
  },
});

// Helper function to get authenticated user context
async function getAuthenticatedContext(req: Request) {
  const authContext = await getAuthContext(req);
  if (!authContext) {
    throw new Error("Authentication required");
  }
  return authContext;
}

// Helper function to extract permissions
function getPermissions(authContext: any): string[] {
  return authContext.authType === "jwt"
    ? authContext.permissions
    : authContext.apiKey.permissions;
}

// Helper function to extract user ID
function getUserId(authContext: any): UUID {
  return authContext.authType === "jwt"
    ? authContext.user.id
    : authContext.apiKey.userId;
}

export const resolvers = {
  // Custom scalars
  DateTime: DateTimeScalar,
  JSON: JSONScalar,
  Upload: GraphQLUpload,

  // Query resolvers
  Query: {
    // Content queries
    content: async (
      _: any,
      { id }: { id: string },
      { req }: { req: Request },
    ) => {
      const authContext = await getAuthenticatedContext(req);
      const permissions = getPermissions(authContext);

      return await contentService.getContent(id, permissions);
    },

    contents: async (
      _: any,
      { filter, pagination }: { filter?: any; pagination?: any },
      { req }: { req: Request },
    ) => {
      const authContext = await getAuthenticatedContext(req);
      const permissions = getPermissions(authContext);

      const options = {
        contentType: filter?.contentType,
        locale: filter?.locale,
        status: filter?.status,
        author: filter?.author,
        tags: filter?.tags,
        categories: filter?.categories,
        search: filter?.search,
        limit: pagination?.limit || 20,
        offset: pagination?.offset || 0,
        sortBy: pagination?.sortBy || "createdAt",
        sortOrder: pagination?.sortOrder || "desc",
      };

      const result = await contentService.listContent(options, permissions);

      // Transform to GraphQL connection format
      return {
        edges: result.content.map((content: Content, index: number) => ({
          node: content,
          cursor: Buffer.from(`${options.offset + index}`).toString("base64"),
        })),
        pageInfo: {
          hasNextPage: result.hasMore,
          hasPreviousPage: options.offset > 0,
          startCursor: result.content.length > 0
            ? Buffer.from(`${options.offset}`).toString("base64")
            : null,
          endCursor: result.content.length > 0
            ? Buffer.from(`${options.offset + result.content.length - 1}`)
              .toString("base64")
            : null,
        },
        totalCount: result.total,
      };
    },

    contentBySlug: async (
      _: any,
      { slug, locale }: { slug: string; locale: string },
      { req }: { req: Request },
    ) => {
      const authContext = await getAuthenticatedContext(req);
      const permissions = getPermissions(authContext);

      return await contentService.getContentBySlug(slug, locale, permissions);
    },

    contentVersions: async (
      _: any,
      { contentId }: { contentId: string },
      { req }: { req: Request },
    ) => {
      const authContext = await getAuthenticatedContext(req);
      const permissions = getPermissions(authContext);

      return await contentService.getContentVersions(contentId, permissions);
    },

    // Media queries
    media: async (
      _: any,
      { id }: { id: string },
      { req }: { req: Request },
    ) => {
      const authContext = await getAuthenticatedContext(req);
      const permissions = getPermissions(authContext);

      return await mediaService.getMediaFile(id, permissions);
    },

    medias: async (
      _: any,
      { filter, pagination }: { filter?: any; pagination?: any },
      { req }: { req: Request },
    ) => {
      const authContext = await getAuthenticatedContext(req);
      const permissions = getPermissions(authContext);

      const options = {
        folder: filter?.folder,
        type: filter?.type,
        search: filter?.search,
        tags: filter?.tags,
        mimeType: filter?.mimeType,
        limit: pagination?.limit || 20,
        offset: pagination?.offset || 0,
      };

      const result = await mediaService.listMedia(options, permissions);

      // Transform to GraphQL connection format
      return {
        edges: result.files.map((media: MediaFile, index: number) => ({
          node: media,
          cursor: Buffer.from(`${options.offset + index}`).toString("base64"),
        })),
        pageInfo: {
          hasNextPage: result.hasMore,
          hasPreviousPage: options.offset > 0,
          startCursor: result.files.length > 0
            ? Buffer.from(`${options.offset}`).toString("base64")
            : null,
          endCursor: result.files.length > 0
            ? Buffer.from(`${options.offset + result.files.length - 1}`)
              .toString("base64")
            : null,
        },
        totalCount: result.total,
      };
    },

    mediaFolder: async (
      _: any,
      { id }: { id: string },
      { req }: { req: Request },
    ) => {
      const authContext = await getAuthenticatedContext(req);
      const permissions = getPermissions(authContext);

      return await mediaService.getFolder(id, permissions);
    },

    mediaFolders: async (
      _: any,
      { parentId }: { parentId?: string },
      { req }: { req: Request },
    ) => {
      const authContext = await getAuthenticatedContext(req);
      const permissions = getPermissions(authContext);

      return await mediaService.getFolders(parentId, permissions);
    },

    mediaFolderTree: async (_: any, __: any, { req }: { req: Request }) => {
      const authContext = await getAuthenticatedContext(req);
      const permissions = getPermissions(authContext);

      return await mediaService.getFolderTree(permissions);
    },

    // User queries
    currentUser: async (_: any, __: any, { req }: { req: Request }) => {
      const authContext = await getAuthenticatedContext(req);

      if (authContext.authType === "jwt") {
        return authContext.user;
      } else {
        // For API key auth, fetch user data
        return await contentService.getUser(authContext.apiKey.userId);
      }
    },

    // API Key queries
    apiKeys: async (_: any, __: any, { req }: { req: Request }) => {
      const authContext = await getAuthenticatedContext(req);

      if (authContext.authType !== "jwt") {
        throw new Error("JWT authentication required for API key management");
      }

      if (!authContext.permissions.includes("manage_api_keys")) {
        throw new Error("Insufficient permissions");
      }

      const userId = authContext.user.id;
      return await ApiKeyManager.getUserApiKeys(userId);
    },

    apiKey: async (
      _: any,
      { id }: { id: string },
      { req }: { req: Request },
    ) => {
      const authContext = await getAuthenticatedContext(req);

      if (authContext.authType !== "jwt") {
        throw new Error("JWT authentication required for API key management");
      }

      const apiKey = await ApiKeyManager.getApiKey(id);
      if (!apiKey) {
        throw new Error("API key not found");
      }

      // Check permissions
      if (
        apiKey.userId !== authContext.user.id &&
        !authContext.permissions.includes("manage_all_api_keys")
      ) {
        throw new Error("Access denied");
      }

      return apiKey;
    },

    // Analytics queries
    contentAnalytics: async (
      _: any,
      { contentId, timeRange }: { contentId: string; timeRange: any },
      { req }: { req: Request },
    ) => {
      const authContext = await getAuthenticatedContext(req);
      const permissions = getPermissions(authContext);

      return await contentService.getContentAnalytics(
        contentId,
        timeRange,
        permissions,
      );
    },

    mediaAnalytics: async (
      _: any,
      { timeRange }: { timeRange?: any },
      { req }: { req: Request },
    ) => {
      const authContext = await getAuthenticatedContext(req);
      const permissions = getPermissions(authContext);

      return await mediaService.getMediaAnalytics(timeRange, permissions);
    },

    // System queries
    systemInfo: async () => {
      return {
        version: "1.0.0",
        environment: Deno.env.get("ENVIRONMENT") || "development",
        features: [
          "content_management",
          "media_management",
          "authentication",
          "api_keys",
          "multilingual",
          "analytics",
          "graphql",
          "rest_api",
        ],
        limits: {
          maxFileSize: 50 * 1024 * 1024, // 50MB
          maxApiKeysPerUser: 10,
          maxContentPerUser: 1000,
          allowedFileTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
            "video/mp4",
            "video/webm",
            "application/pdf",
            "text/plain",
            "application/json",
          ],
        },
      };
    },
  },

  // Mutation resolvers
  Mutation: {
    // Content mutations
    createContent: async (
      _: any,
      { input }: { input: any },
      { req }: { req: Request },
    ) => {
      try {
        const authContext = await getAuthenticatedContext(req);
        const userId = getUserId(authContext);
        const permissions = getPermissions(authContext);

        const content = await contentService.createContent(
          input,
          userId,
          permissions,
        );

        return {
          success: true,
          message: "Content created successfully",
          content,
          errors: [],
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error
            ? error.message
            : "Failed to create content",
          content: null,
          errors: [
            {
              field: "general",
              message: error instanceof Error ? error.message : "Unknown error",
              code: "CREATE_FAILED",
            },
          ],
        };
      }
    },

    updateContent: async (
      _: any,
      { id, input }: { id: string; input: any },
      { req }: { req: Request },
    ) => {
      try {
        const authContext = await getAuthenticatedContext(req);
        const userId = getUserId(authContext);
        const permissions = getPermissions(authContext);

        const content = await contentService.updateContent(
          id,
          input,
          userId,
          permissions,
        );

        return {
          success: true,
          message: "Content updated successfully",
          content,
          errors: [],
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error
            ? error.message
            : "Failed to update content",
          content: null,
          errors: [
            {
              field: "general",
              message: error instanceof Error ? error.message : "Unknown error",
              code: "UPDATE_FAILED",
            },
          ],
        };
      }
    },

    publishContent: async (
      _: any,
      { id }: { id: string },
      { req }: { req: Request },
    ) => {
      try {
        const authContext = await getAuthenticatedContext(req);
        const userId = getUserId(authContext);
        const permissions = getPermissions(authContext);

        const content = await contentService.publishContent(
          id,
          userId,
          permissions,
        );

        return {
          success: true,
          message: "Content published successfully",
          content,
          errors: [],
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error
            ? error.message
            : "Failed to publish content",
          content: null,
          errors: [
            {
              field: "general",
              message: error instanceof Error ? error.message : "Unknown error",
              code: "PUBLISH_FAILED",
            },
          ],
        };
      }
    },

    // Media mutations
    uploadMedia: async (
      _: any,
      { file, alt, caption, tags, folderId }: any,
      { req }: { req: Request },
    ) => {
      try {
        const authContext = await getAuthenticatedContext(req);
        const userId = getUserId(authContext);
        const permissions = getPermissions(authContext);

        const uploadedFile = await file;
        const mediaFile = await mediaService.uploadFile(
          uploadedFile,
          {
            alt,
            caption,
            tags: tags || [],
            folderId,
          },
          userId,
          permissions,
        );

        return {
          success: true,
          message: "Media uploaded successfully",
          media: mediaFile,
          errors: [],
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error
            ? error.message
            : "Failed to upload media",
          media: null,
          errors: [
            {
              field: "file",
              message: error instanceof Error ? error.message : "Unknown error",
              code: "UPLOAD_FAILED",
            },
          ],
        };
      }
    },

    // API Key mutations
    createApiKey: async (
      _: any,
      { input }: { input: any },
      { req }: { req: Request },
    ) => {
      try {
        const authContext = await getAuthenticatedContext(req);

        if (authContext.authType !== "jwt") {
          throw new Error("JWT authentication required for API key management");
        }

        if (!authContext.permissions.includes("manage_api_keys")) {
          throw new Error("Insufficient permissions");
        }

        const userId = authContext.user.id;
        const { apiKey, plainKey } = await ApiKeyManager.createApiKey(
          userId,
          input,
        );

        return {
          success: true,
          message: "API key created successfully",
          apiKey,
          plainKey,
          errors: [],
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error
            ? error.message
            : "Failed to create API key",
          apiKey: null,
          plainKey: null,
          errors: [
            {
              field: "general",
              message: error instanceof Error ? error.message : "Unknown error",
              code: "CREATE_FAILED",
            },
          ],
        };
      }
    },
  },

  // Field resolvers for complex types
  Content: {
    author: async (content: Content) => {
      // This would fetch the user data based on the authorId
      // For now, return a mock user object
      return {
        id: content.authorId,
        email: "user@example.com",
        username: "user",
        firstName: "John",
        lastName: "Doe",
        locale: "en",
        emailVerified: true,
        isActive: true,
        roles: [],
        permissions: [],
        teams: [],
        createdContent: [],
        uploadedMedia: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    },

    featuredMedia: async (content: Content) => {
      if (!content.featuredMediaId) return null;
      // This would fetch the media file
      return null; // Placeholder
    },

    relatedContent: async (content: Content) => {
      if (!content.relatedContent || content.relatedContent.length === 0) {
        return [];
      }
      // This would fetch related content
      return []; // Placeholder
    },

    translations: async (content: Content) => {
      // This would fetch content translations
      return []; // Placeholder
    },

    versions: async (content: Content) => {
      // This would fetch content versions
      return []; // Placeholder
    },

    comments: async (content: Content) => {
      // This would fetch content comments
      return []; // Placeholder
    },
  },

  MediaFile: {
    uploadedBy: async (mediaFile: MediaFile) => {
      return {
        id: mediaFile.uploadedById,
        email: "user@example.com",
        username: "user",
        firstName: "John",
        lastName: "Doe",
        locale: "en",
        emailVerified: true,
        isActive: true,
        roles: [],
        permissions: [],
        teams: [],
        createdContent: [],
        uploadedMedia: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    },

    folder: async (mediaFile: MediaFile) => {
      if (!mediaFile.folderId) return null;
      // This would fetch the folder
      return null; // Placeholder
    },

    variants: async (mediaFile: MediaFile) => {
      // This would fetch media variants
      return []; // Placeholder
    },
  },

  // Subscription resolvers (for real-time features)
  Subscription: {
    contentUpdated: {
      subscribe: () => {
        // This would set up a subscription for content updates
        // Implementation depends on the subscription system used
        return {};
      },
    },

    mediaUploaded: {
      subscribe: () => {
        // This would set up a subscription for media uploads
        return {};
      },
    },

    analyticsUpdated: {
      subscribe: () => {
        // This would set up a subscription for analytics updates
        return {};
      },
    },
  },
};
