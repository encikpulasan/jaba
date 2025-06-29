// Content Repository
// Advanced content management with versioning, multilingual support, and relationships

import { BaseRepository } from "@/lib/db/repositories/base.ts";
import { KeyPatterns } from "@/lib/db/patterns.ts";
import type {
  BaseEntity,
  Content,
  ContentComment,
  ContentFieldValue,
  ContentSchema,
  ContentTemplate,
  ContentVersion,
  Locale,
  PublishStatus,
  TranslationStatus,
  UUID,
  WorkflowStatus,
} from "@/types";
import { db } from "@/lib/db/connection.ts";

export class ContentRepository extends BaseRepository<Content> {
  protected entityName = "content";
  protected keyPatterns = KeyPatterns.content;

  // Create content with automatic slug generation and multilingual support
  async createContent(
    contentData: Omit<Content, keyof BaseEntity | "slug" | "viewCount">,
    userId: UUID,
  ): Promise<Content> {
    // Generate unique slug
    const slug = await this.generateUniqueSlug(
      contentData.title,
      contentData.locale,
    );

    const content: Content = {
      id: crypto.randomUUID(),
      ...contentData,
      slug,
      viewCount: 0,
      author: userId,
      collaborators: contentData.collaborators || [],
      tags: contentData.tags || [],
      categories: contentData.categories || [],
      metadata: contentData.metadata || {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: userId,
      updatedBy: userId,
      version: 1,
      auditLog: [],
      isDeleted: false,
    };

    // Validate content against schema
    await this.validateContentAgainstSchema(content);

    const created = await this.create(content, userId);

    // Create initial version
    await this.createVersion(created, userId, "Initial version");

    return created;
  }

  // Update content with versioning
  async updateContent(
    id: UUID,
    updates: Partial<Omit<Content, keyof BaseEntity>>,
    userId: UUID,
    createVersion = true,
  ): Promise<Content> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error("Content not found");
    }

    // Update slug if title changed
    if (updates.title && updates.title !== existing.title) {
      updates.slug = await this.generateUniqueSlug(
        updates.title,
        existing.locale,
        id,
      );
    }

    const updated = await this.update(id, updates, userId);

    // Create version if requested
    if (createVersion) {
      const changes = this.calculateContentChanges(existing, updated);
      await this.createVersion(updated, userId, changes);
    }

    return updated;
  }

  // Publish content
  async publishContent(id: UUID, userId: UUID): Promise<Content> {
    const content = await this.findById(id);
    if (!content) {
      throw new Error("Content not found");
    }

    if (content.status === "published") {
      throw new Error("Content is already published");
    }

    const now = Date.now();
    return await this.updateContent(
      id,
      {
        status: "published" as PublishStatus,
        workflowStatus: "published" as WorkflowStatus,
        publishedAt: now,
      },
      userId,
      true,
    );
  }

  // Unpublish content
  async unpublishContent(id: UUID, userId: UUID): Promise<Content> {
    return await this.updateContent(
      id,
      {
        status: "draft" as PublishStatus,
        workflowStatus: "draft" as WorkflowStatus,
        publishedAt: undefined,
      },
      userId,
      true,
    );
  }

  // Schedule content for publication
  async scheduleContent(
    id: UUID,
    scheduledAt: number,
    userId: UUID,
  ): Promise<Content> {
    return await this.updateContent(
      id,
      {
        status: "scheduled" as PublishStatus,
        scheduledAt,
      },
      userId,
      true,
    );
  }

  // Find content by slug and locale
  async findBySlug(
    slug: string,
    locale?: Locale,
    includeUnpublished = false,
  ): Promise<Content | null> {
    const connection = db.getConnection();
    const key = locale
      ? KeyPatterns.content.bySlug(slug, locale)
      : KeyPatterns.content.bySlug(slug);

    const result = await (connection.kv as Deno.Kv).get<UUID>(key);
    if (!result.value) {
      return null;
    }

    const content = await this.findById(result.value);
    if (!content) {
      return null;
    }

    // Check publication status
    if (!includeUnpublished && content.status !== "published") {
      return null;
    }

    return content;
  }

  // Find content by type
  async findByContentType(
    contentType: string,
    options?: {
      locale?: Locale;
      status?: PublishStatus;
      limit?: number;
      offset?: number;
    },
  ): Promise<Content[]> {
    const allContent = await this.findAll();
    let filtered = allContent.filter((content) =>
      content.contentType === contentType
    );

    // Apply filters
    if (options?.locale) {
      filtered = filtered.filter((content) =>
        content.locale === options.locale
      );
    }

    if (options?.status) {
      filtered = filtered.filter((content) =>
        content.status === options.status
      );
    }

    // Apply pagination
    if (options?.offset) {
      filtered = filtered.slice(options.offset);
    }

    if (options?.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }

  // Find content by author
  async findByAuthor(
    authorId: UUID,
    options?: { status?: PublishStatus; limit?: number },
  ): Promise<Content[]> {
    const allContent = await this.findAll();
    let filtered = allContent.filter((content) => content.author === authorId);

    if (options?.status) {
      filtered = filtered.filter((content) =>
        content.status === options.status
      );
    }

    if (options?.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }

  // Search content
  async searchContent(
    query: string,
    options?: {
      locale?: Locale;
      contentType?: string;
      status?: PublishStatus;
      limit?: number;
    },
  ): Promise<Content[]> {
    const allContent = await this.findAll();
    const lowerQuery = query.toLowerCase();

    let results = allContent.filter((content) => {
      const titleMatch = content.title.toLowerCase().includes(lowerQuery);
      const bodyMatch = content.body.toLowerCase().includes(lowerQuery);
      const tagMatch = content.tags.some((tag) =>
        tag.toLowerCase().includes(lowerQuery)
      );
      const categoryMatch = content.categories.some((cat) =>
        cat.toLowerCase().includes(lowerQuery)
      );

      return titleMatch || bodyMatch || tagMatch || categoryMatch;
    });

    // Apply filters
    if (options?.locale) {
      results = results.filter((content) => content.locale === options.locale);
    }

    if (options?.contentType) {
      results = results.filter((content) =>
        content.contentType === options.contentType
      );
    }

    if (options?.status) {
      results = results.filter((content) => content.status === options.status);
    }

    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  // Get content versions
  async getContentVersions(contentId: UUID): Promise<ContentVersion[]> {
    const connection = db.getConnection();
    const versions: ContentVersion[] = [];

    const iterator = (connection.kv as Deno.Kv).list<ContentVersion>({
      prefix: KeyPatterns.content.versions(contentId),
    });

    for await (const { value } of iterator) {
      if (value) {
        versions.push(value);
      }
    }

    return versions.sort((a, b) => b.version - a.version);
  }

  // Create content version
  async createVersion(
    content: Content,
    userId: UUID,
    changes: string,
  ): Promise<ContentVersion> {
    const versions = await this.getContentVersions(content.id);
    const nextVersion = versions.length > 0 ? versions[0].version + 1 : 1;

    const version: ContentVersion = {
      id: crypto.randomUUID(),
      contentId: content.id,
      version: nextVersion,
      title: content.title,
      body: content.body,
      fields: content.fields,
      status: content.status,
      publishedAt: content.publishedAt,
      author: userId,
      changes,
      metadata: content.metadata,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: userId,
      updatedBy: userId,
    };

    const connection = db.getConnection();
    await (connection.kv as Deno.Kv).set(
      KeyPatterns.content.version(content.id, nextVersion),
      version,
    );

    return version;
  }

  // Restore content from version
  async restoreFromVersion(
    contentId: UUID,
    versionNumber: number,
    userId: UUID,
  ): Promise<Content> {
    const connection = db.getConnection();
    const versionResult = await (connection.kv as Deno.Kv).get<ContentVersion>(
      KeyPatterns.content.version(contentId, versionNumber),
    );

    if (!versionResult.value) {
      throw new Error("Version not found");
    }

    const version = versionResult.value;
    return await this.updateContent(
      contentId,
      {
        title: version.title,
        body: version.body,
        fields: version.fields,
      },
      userId,
      true,
    );
  }

  // Increment view count
  async incrementViewCount(id: UUID): Promise<void> {
    const content = await this.findById(id);
    if (content) {
      await this.update(
        id,
        { viewCount: content.viewCount + 1 },
        "system",
      );
    }
  }

  // Required abstract method implementations
  protected async validateEntity(entity: Content): Promise<void> {
    if (!entity.title || entity.title.trim().length === 0) {
      throw new Error("Content title is required");
    }

    if (!entity.contentType) {
      throw new Error("Content type is required");
    }

    if (!entity.locale) {
      throw new Error("Content locale is required");
    }

    // Validate against schema
    await this.validateContentAgainstSchema(entity);
  }

  protected async addToIndexes(
    entity: Content,
    atomic: Deno.AtomicOperation,
  ): Promise<void> {
    // Add slug index
    atomic.set(
      KeyPatterns.content.bySlug(entity.slug, entity.locale),
      entity.id,
    );

    // Add content type index
    atomic.set(KeyPatterns.content.byType(entity.contentType), entity.id);

    // Add author index
    atomic.set(KeyPatterns.content.byAuthor(entity.author), entity.id);

    // Add status index
    atomic.set(KeyPatterns.content.byStatus(entity.status), entity.id);

    // Add locale index
    atomic.set(KeyPatterns.content.byLocale(entity.locale), entity.id);
  }

  protected async updateIndexes(
    oldEntity: Content,
    newEntity: Content,
    atomic: Deno.AtomicOperation,
  ): Promise<void> {
    // Update slug index if changed
    if (oldEntity.slug !== newEntity.slug) {
      atomic.delete(
        KeyPatterns.content.bySlug(oldEntity.slug, oldEntity.locale),
      );
      atomic.set(
        KeyPatterns.content.bySlug(newEntity.slug, newEntity.locale),
        newEntity.id,
      );
    }

    // Update content type index if changed
    if (oldEntity.contentType !== newEntity.contentType) {
      atomic.delete(KeyPatterns.content.byType(oldEntity.contentType));
      atomic.set(
        KeyPatterns.content.byType(newEntity.contentType),
        newEntity.id,
      );
    }

    // Update status index if changed
    if (oldEntity.status !== newEntity.status) {
      atomic.delete(KeyPatterns.content.byStatus(oldEntity.status));
      atomic.set(KeyPatterns.content.byStatus(newEntity.status), newEntity.id);
    }

    // Update locale index if changed
    if (oldEntity.locale !== newEntity.locale) {
      atomic.delete(KeyPatterns.content.byLocale(oldEntity.locale));
      atomic.set(KeyPatterns.content.byLocale(newEntity.locale), newEntity.id);
    }
  }

  protected async removeFromIndexes(
    entity: Content,
    atomic: Deno.AtomicOperation,
  ): Promise<void> {
    atomic.delete(
      KeyPatterns.content.bySlug(entity.slug, entity.locale),
    );
    atomic.delete(KeyPatterns.content.byType(entity.contentType));
    atomic.delete(KeyPatterns.content.byAuthor(entity.author));
    atomic.delete(KeyPatterns.content.byStatus(entity.status));
    atomic.delete(KeyPatterns.content.byLocale(entity.locale));
  }

  // Helper methods
  private async generateUniqueSlug(
    title: string,
    locale: Locale,
    excludeId?: UUID,
  ): Promise<string> {
    const baseSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, "-")
      .substring(0, 50);

    let slug = baseSlug;
    let counter = 1;

    while (true) {
      const existing = await this.findBySlug(slug, locale, true);
      if (!existing || existing.id === excludeId) {
        return slug;
      }
      slug = `${baseSlug}-${counter}`;
      counter++;
    }
  }

  private async validateContentAgainstSchema(content: Content): Promise<void> {
    // TODO: Implement schema validation
    // This would validate content.fields against content.schema.fields
    // For now, we'll skip this but it's important for production
  }

  private calculateContentChanges(
    oldContent: Content,
    newContent: Content,
  ): string {
    const changes: string[] = [];

    if (oldContent.title !== newContent.title) {
      changes.push("Title updated");
    }
    if (oldContent.body !== newContent.body) {
      changes.push("Body content updated");
    }
    if (oldContent.status !== newContent.status) {
      changes.push(
        `Status changed from ${oldContent.status} to ${newContent.status}`,
      );
    }
    if (
      JSON.stringify(oldContent.fields) !== JSON.stringify(newContent.fields)
    ) {
      changes.push("Custom fields updated");
    }

    return changes.length > 0 ? changes.join(", ") : "Content updated";
  }
}

// Export singleton instance
export const contentRepository = new ContentRepository();
