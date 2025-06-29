// Content Service
// Business logic layer for content management with advanced features

import { contentRepository } from "./repository.ts";
import { RBACManager } from "@/lib/auth/rbac.ts";
import type {
  Content,
  ContentListOptions,
  ContentSchema,
  ContentSearchOptions,
  ContentTemplate,
  ContentVersion,
  CreateContentRequest,
  Locale,
  Permission,
  PublishStatus,
  UpdateContentRequest,
  UUID,
} from "@/types";

export class ContentService {
  private repository = contentRepository;

  // Create new content
  async createContent(
    data: any,
    userId: UUID,
    userPermissions: Permission[],
  ): Promise<Content> {
    // Check permissions
    if (!userPermissions.includes("content.create")) {
      throw new Error("Insufficient permissions to create content");
    }

    // Validate required fields
    if (!data.title?.trim()) {
      throw new Error("Content title is required");
    }

    if (!data.contentType) {
      throw new Error("Content type is required");
    }

    if (!data.locale) {
      throw new Error("Content locale is required");
    }

    // Prepare content data
    const contentData = {
      title: data.title.trim(),
      body: data.body || "",
      contentType: data.contentType,
      locale: data.locale,
      status: (data.status || "draft") as PublishStatus,
      workflowStatus: "draft" as const,
      schema: data.schema || await this.getDefaultSchema(data.contentType),
      fields: data.fields || {},
      tags: data.tags || [],
      categories: data.categories || [],
      summary: data.summary,
      excerpt: data.excerpt,
      featuredImage: data.featuredImage,
      seoTitle: data.seoTitle,
      seoDescription: data.seoDescription,
      seoKeywords: data.seoKeywords || [],
      collaborators: data.collaborators || [],
      parentId: data.parentId,
      relatedContent: data.relatedContent || [],
      metadata: data.metadata || {},
      defaultLocale: data.locale,
      translations: {},
    };

    return await this.repository.createContent(contentData, userId);
  }

  // Update existing content
  async updateContent(
    id: UUID,
    data: UpdateContentRequest,
    userId: UUID,
    userPermissions: Permission[],
  ): Promise<Content> {
    const content = await this.repository.findById(id);
    if (!content) {
      throw new Error("Content not found");
    }

    // Check permissions
    const canEditOwn = userPermissions.includes("edit_own_content") &&
      content.author === userId;
    const canEditAll = userPermissions.includes("edit_content");

    if (!canEditOwn && !canEditAll) {
      throw new Error("Insufficient permissions to edit this content");
    }

    // Prepare update data
    const updateData: Partial<Content> = {};

    if (data.title !== undefined) updateData.title = data.title.trim();
    if (data.body !== undefined) updateData.body = data.body;
    if (data.summary !== undefined) updateData.summary = data.summary;
    if (data.excerpt !== undefined) updateData.excerpt = data.excerpt;
    if (data.tags !== undefined) updateData.tags = data.tags;
    if (data.categories !== undefined) updateData.categories = data.categories;
    if (data.featuredImage !== undefined) {
      updateData.featuredImage = data.featuredImage;
    }
    if (data.seoTitle !== undefined) updateData.seoTitle = data.seoTitle;
    if (data.seoDescription !== undefined) {
      updateData.seoDescription = data.seoDescription;
    }
    if (data.seoKeywords !== undefined) {
      updateData.seoKeywords = data.seoKeywords;
    }
    if (data.fields !== undefined) {
      updateData.fields = { ...content.fields, ...data.fields };
    }
    if (data.collaborators !== undefined) {
      updateData.collaborators = data.collaborators;
    }
    if (data.relatedContent !== undefined) {
      updateData.relatedContent = data.relatedContent;
    }
    if (data.metadata !== undefined) {
      updateData.metadata = { ...content.metadata, ...data.metadata };
    }

    return await this.repository.updateContent(id, updateData, userId, true);
  }

  // Delete content
  async deleteContent(
    id: UUID,
    userId: UUID,
    userPermissions: Permission[],
  ): Promise<boolean> {
    const content = await this.repository.findById(id);
    if (!content) {
      throw new Error("Content not found");
    }

    // Check permissions
    const canDeleteOwn = userPermissions.includes("delete_own_content") &&
      content.author === userId;
    const canDeleteAll = userPermissions.includes("delete_content");

    if (!canDeleteOwn && !canDeleteAll) {
      throw new Error("Insufficient permissions to delete this content");
    }

    return await this.repository.softDelete(id, userId);
  }

  // Publish content
  async publishContent(
    id: UUID,
    userId: UUID,
    userPermissions: Permission[],
  ): Promise<Content> {
    if (!userPermissions.includes("content.publish")) {
      throw new Error("Insufficient permissions to publish content");
    }

    const content = await this.repository.findById(id);
    if (!content) {
      throw new Error("Content not found");
    }

    if (content.status === "published") {
      throw new Error("Content is already published");
    }

    // Validate content is ready for publication
    await this.validateForPublication(content);

    const now = Date.now();
    return await this.repository.updateContent(
      id,
      {
        status: "published" as PublishStatus,
        workflowStatus: "published" as const,
        publishedAt: now,
      },
      userId,
      true,
    );
  }

  // Unpublish content
  async unpublishContent(
    id: UUID,
    userId: UUID,
    userPermissions: Permission[],
  ): Promise<Content> {
    if (!userPermissions.includes("publish_content")) {
      throw new Error("Insufficient permissions to unpublish content");
    }

    return await this.repository.updateContent(
      id,
      {
        status: "draft" as PublishStatus,
        workflowStatus: "draft" as const,
        publishedAt: undefined,
      },
      userId,
      true,
    );
  }

  // Schedule content
  async scheduleContent(
    id: UUID,
    scheduledAt: number,
    userId: UUID,
    userPermissions: Permission[],
  ): Promise<Content> {
    if (!userPermissions.includes("publish_content")) {
      throw new Error("Insufficient permissions to schedule content");
    }

    if (scheduledAt <= Date.now()) {
      throw new Error("Scheduled time must be in the future");
    }

    const content = await this.repository.findById(id);
    if (!content) {
      throw new Error("Content not found");
    }

    // Validate content is ready for publication
    await this.validateForPublication(content);

    return await this.repository.updateContent(
      id,
      {
        status: "scheduled" as PublishStatus,
        scheduledAt,
      },
      userId,
      true,
    );
  }

  // Get content by ID
  async getContent(
    id: UUID,
    userId?: UUID,
    userPermissions: Permission[] = [],
  ): Promise<Content | null> {
    const content = await this.repository.findById(id);
    if (!content) {
      return null;
    }

    // Check if user can view unpublished content
    if (content.status !== "published") {
      const canViewUnpublished = userPermissions.includes("content.read");
      const isAuthor = content.author === userId;
      const isCollaborator = content.collaborators.includes(userId || "");

      if (!canViewUnpublished && !isAuthor && !isCollaborator) {
        return null;
      }
    }

    // Increment view count for published content
    if (content.status === "published") {
      await this.repository.incrementViewCount(id);
    }

    return content;
  }

  // Get content by slug
  async getContentBySlug(
    slug: string,
    locale?: Locale,
    userId?: UUID,
    userPermissions: Permission[] = [],
  ): Promise<Content | null> {
    const includeUnpublished = userPermissions.includes(
      "view_unpublished_content",
    );
    const content = await this.repository.findBySlug(
      slug,
      locale,
      includeUnpublished,
    );

    if (!content) {
      return null;
    }

    // Additional permission check for unpublished content
    if (content.status !== "published") {
      const isAuthor = content.author === userId;
      const isCollaborator = content.collaborators.includes(userId || "");

      if (!includeUnpublished && !isAuthor && !isCollaborator) {
        return null;
      }
    }

    // Increment view count for published content
    if (content.status === "published") {
      await this.repository.incrementViewCount(content.id);
    }

    return content;
  }

  // List content with filtering and pagination
  async listContent(
    options: ContentListOptions = {},
    userPermissions: Permission[] = [],
  ): Promise<{ content: Content[]; total: number; hasMore: boolean }> {
    const {
      contentType,
      locale,
      status,
      author,
      tags,
      categories,
      limit = 20,
      offset = 0,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = options;

    // Get content based on filters
    let content: Content[] = [];

    if (contentType) {
      content = await this.repository.findByContentType(contentType, {
        locale,
        status,
        limit: limit + 1, // Get one extra to check if there are more
        offset,
      });
    } else if (author) {
      content = await this.repository.findByAuthor(author, {
        status,
        limit: limit + 1,
      });
      if (offset > 0) {
        content = content.slice(offset);
      }
    } else {
      const allContent = await this.repository.findAll();
      content = allContent;
    }

    // Apply additional filters
    if (locale && !contentType) {
      content = content.filter((c) => c.locale === locale);
    }

    if (status && !contentType && !author) {
      content = content.filter((c) => c.status === status);
    }

    if (tags && tags.length > 0) {
      content = content.filter((c) => tags.some((tag) => c.tags.includes(tag)));
    }

    if (categories && categories.length > 0) {
      content = content.filter((c) =>
        categories.some((cat) => c.categories.includes(cat))
      );
    }

    // Filter based on permissions
    const canViewUnpublished = userPermissions.includes(
      "view_unpublished_content",
    );
    if (!canViewUnpublished) {
      content = content.filter((c) => c.status === "published");
    }

    // Sort content
    content.sort((a, b) => {
      let aValue: any, bValue: any;

      switch (sortBy) {
        case "title":
          aValue = a.title.toLowerCase();
          bValue = b.title.toLowerCase();
          break;
        case "publishedAt":
          aValue = a.publishedAt || 0;
          bValue = b.publishedAt || 0;
          break;
        case "viewCount":
          aValue = a.viewCount;
          bValue = b.viewCount;
          break;
        default:
          aValue = a.createdAt;
          bValue = b.createdAt;
      }

      if (sortOrder === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    // Apply pagination
    const hasMore = content.length > limit;
    const paginatedContent = content.slice(offset, offset + limit);

    return {
      content: paginatedContent,
      total: content.length - (hasMore ? 1 : 0),
      hasMore,
    };
  }

  // Search content
  async searchContent(
    query: string,
    options: ContentSearchOptions = {},
    userPermissions: Permission[] = [],
  ): Promise<Content[]> {
    if (!query.trim()) {
      return [];
    }

    const {
      locale,
      contentType,
      status = userPermissions.includes("view_unpublished_content")
        ? undefined
        : "published",
      limit = 50,
    } = options;

    return await this.repository.searchContent(query, {
      locale,
      contentType,
      status,
      limit,
    });
  }

  // Get content versions
  async getContentVersions(
    contentId: UUID,
    userId: UUID,
    userPermissions: Permission[],
  ): Promise<ContentVersion[]> {
    const content = await this.repository.findById(contentId);
    if (!content) {
      throw new Error("Content not found");
    }

    // Check permissions to view versions
    const canView = userPermissions.includes("view_content") ||
      (userPermissions.includes("edit_own_content") &&
        content.author === userId);

    if (!canView) {
      throw new Error("Insufficient permissions to view content versions");
    }

    return await this.repository.getContentVersions(contentId);
  }

  // Restore content from version
  async restoreContentVersion(
    contentId: UUID,
    versionNumber: number,
    userId: UUID,
    userPermissions: Permission[],
  ): Promise<Content> {
    const content = await this.repository.findById(contentId);
    if (!content) {
      throw new Error("Content not found");
    }

    // Check permissions
    const canEdit = userPermissions.includes("edit_content") ||
      (userPermissions.includes("edit_own_content") &&
        content.author === userId);

    if (!canEdit) {
      throw new Error("Insufficient permissions to restore content");
    }

    return await this.repository.restoreFromVersion(
      contentId,
      versionNumber,
      userId,
    );
  }

  // Helper methods
  private async validateForPublication(content: Content): Promise<void> {
    if (!content.title.trim()) {
      throw new Error("Content must have a title to be published");
    }

    if (!content.body.trim()) {
      throw new Error("Content must have body content to be published");
    }

    // Additional validation can be added here
    // e.g., required fields based on content schema
  }

  private async getDefaultSchema(contentType: string): Promise<ContentSchema> {
    // TODO: Implement schema retrieval from content schema repository
    // For now, return a basic schema
    return {
      id: crypto.randomUUID(),
      name: contentType,
      description: `Default schema for ${contentType}`,
      fields: [],
      isSystem: true,
      permissions: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  // Process scheduled content (should be called by a background job)
  async processScheduledContent(): Promise<void> {
    const allContent = await this.repository.findAll();
    const now = Date.now();

    const scheduledContent = allContent.filter((content) =>
      content.status === "scheduled" &&
      content.scheduledAt &&
      content.scheduledAt <= now
    );

    for (const content of scheduledContent) {
      try {
        await this.repository.updateContent(
          content.id,
          {
            status: "published" as PublishStatus,
            workflowStatus: "published" as const,
            publishedAt: now,
            scheduledAt: undefined,
          },
          "system",
          true,
        );
        console.log(`Published scheduled content: ${content.title}`);
      } catch (error) {
        console.error(
          `Failed to publish scheduled content ${content.id}:`,
          error,
        );
      }
    }
  }
}

// Export singleton instance
export const contentService = new ContentService();
