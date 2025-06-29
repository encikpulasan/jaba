// KV Key Patterns
// Standardized key patterns for all entity types in masmaCMS

import type { Locale, UUID } from "@/types";

export const KeyPatterns = {
  // User Management
  users: {
    byId: (id: UUID) => ["users", id],
    byEmail: (email: string) => ["users_by_email", email.toLowerCase()],
    byUsername: (
      username: string,
    ) => ["users_by_username", username.toLowerCase()],
    sessions: (
      userId: UUID,
      sessionId: UUID,
    ) => ["users", userId, "sessions", sessionId],
    preferences: (userId: UUID) => ["users", userId, "preferences"],
    roles: (userId: UUID) => ["users", userId, "roles"],
    all: () => ["users"],
  },

  // Role Management
  roles: {
    byId: (id: UUID) => ["roles", id],
    byName: (name: string) => ["roles_by_name", name.toLowerCase()],
    permissions: (roleId: UUID) => ["roles", roleId, "permissions"],
    all: () => ["roles"],
  },

  // Session Management
  sessions: {
    byId: (sessionId: UUID) => ["sessions", sessionId],
    byUserId: (userId: UUID) => ["sessions_by_user", userId],
    byToken: (token: string) => ["sessions_by_token", token],
    active: () => ["sessions", "active"],
    all: () => ["sessions"],
  },

  // Content Management
  content: {
    byId: (id: UUID) => ["content", id],
    bySlug: (slug: string, locale?: Locale) =>
      locale ? ["content_by_slug", locale, slug] : ["content_by_slug", slug],
    byType: (contentType: string) => ["content_by_type", contentType],
    byAuthor: (authorId: UUID) => ["content_by_author", authorId],
    byStatus: (status: string) => ["content_by_status", status],
    byLocale: (locale: Locale) => ["content_by_locale", locale],
    versions: (contentId: UUID) => ["content", contentId, "versions"],
    version: (
      contentId: UUID,
      version: number,
    ) => ["content", contentId, "versions", version],
    comments: (contentId: UUID) => ["content", contentId, "comments"],
    analytics: (contentId: UUID) => ["content", contentId, "analytics"],
    relationships: (contentId: UUID) => ["content", contentId, "relationships"],
    translations: (contentId: UUID) => ["content", contentId, "translations"],
    all: () => ["content"],
    published: () => ["content", "published"],
    drafts: () => ["content", "drafts"],
  },

  // Content Schema Management
  schemas: {
    byId: (id: UUID) => ["schemas", id],
    byName: (name: string) => ["schemas_by_name", name],
    fields: (schemaId: UUID) => ["schemas", schemaId, "fields"],
    all: () => ["schemas"],
  },

  // Media Management
  media: {
    byId: (id: UUID) => ["media", id],
    byFolder: (folderId: UUID) => ["media_by_folder", folderId],
    byType: (mimeType: string) => ["media_by_type", mimeType],
    byUploader: (uploaderId: UUID) => ["media_by_uploader", uploaderId],
    metadata: (mediaId: UUID) => ["media", mediaId, "metadata"],
    variants: (mediaId: UUID) => ["media", mediaId, "variants"],
    usage: (mediaId: UUID) => ["media", mediaId, "usage"],
    all: () => ["media"],
  },

  // Media Folders
  folders: {
    byId: (id: UUID) => ["folders", id],
    byParent: (parentId: UUID) => ["folders_by_parent", parentId],
    byPath: (path: string) => ["folders_by_path", path],
    children: (folderId: UUID) => ["folders", folderId, "children"],
    all: () => ["folders"],
    root: () => ["folders", "root"],
  },

  // System Settings
  settings: {
    system: () => ["settings", "system"],
    email: () => ["settings", "email"],
    seo: () => ["settings", "seo"],
    cache: () => ["settings", "cache"],
    security: () => ["settings", "security"],
    byKey: (key: string) => ["settings", key],
    all: () => ["settings"],
  },

  // Workflow Management
  workflows: {
    byId: (id: UUID) => ["workflows", id],
    byName: (name: string) => ["workflows_by_name", name],
    stages: (workflowId: UUID) => ["workflows", workflowId, "stages"],
    forContentType: (
      contentType: string,
    ) => ["workflows_by_content_type", contentType],
    active: () => ["workflows", "active"],
    all: () => ["workflows"],
  },

  // Content Workflow States
  contentWorkflows: {
    byId: (id: UUID) => ["content_workflows", id],
    byContent: (contentId: UUID) => ["content_workflows_by_content", contentId],
    byWorkflow: (
      workflowId: UUID,
    ) => ["content_workflows_by_workflow", workflowId],
    byAssignee: (
      assigneeId: UUID,
    ) => ["content_workflows_by_assignee", assigneeId],
    byStage: (stage: string) => ["content_workflows_by_stage", stage],
    history: (
      contentWorkflowId: UUID,
    ) => ["content_workflows", contentWorkflowId, "history"],
    all: () => ["content_workflows"],
  },

  // Internationalization
  translations: {
    byKey: (key: string, locale: Locale) => ["translations", locale, key],
    byNamespace: (
      namespace: string,
      locale: Locale,
    ) => ["translations", locale, "namespace", namespace],
    byLocale: (locale: Locale) => ["translations", locale],
    namespaces: () => ["translation_namespaces"],
    locales: () => ["locales"],
    memory: (
      sourceLocale: Locale,
      targetLocale: Locale,
    ) => ["translation_memory", sourceLocale, targetLocale],
    all: () => ["translations"],
  },

  // Team Management
  teams: {
    byId: (id: UUID) => ["teams", id],
    byName: (name: string) => ["teams_by_name", name.toLowerCase()],
    members: (teamId: UUID) => ["teams", teamId, "members"],
    permissions: (teamId: UUID) => ["teams", teamId, "permissions"],
    projects: (teamId: UUID) => ["teams", teamId, "projects"],
    all: () => ["teams"],
  },

  // API Keys
  apiKeys: {
    byId: (id: UUID) => ["api_keys", id],
    byKey: (key: string) => ["api_keys_by_key", key],
    byUserId: (userId: UUID) => ["api_keys_by_user", userId],
    active: () => ["api_keys", "active"],
    all: () => ["api_keys"],
  },

  // Webhooks
  webhooks: {
    endpoints: {
      byId: (id: UUID) => ["webhook_endpoints", id],
      byUrl: (url: string) => ["webhook_endpoints_by_url", url],
      active: () => ["webhook_endpoints", "active"],
      all: () => ["webhook_endpoints"],
    },
    events: {
      byId: (id: UUID) => ["webhook_events", id],
      byEndpoint: (
        endpointId: UUID,
      ) => ["webhook_events_by_endpoint", endpointId],
      byStatus: (status: string) => ["webhook_events_by_status", status],
      pending: () => ["webhook_events", "pending"],
      failed: () => ["webhook_events", "failed"],
      all: () => ["webhook_events"],
    },
  },

  // Audit Logging
  auditLogs: {
    byId: (id: UUID) => ["audit_logs", id],
    byUserId: (userId: UUID) => ["audit_logs_by_user", userId],
    byAction: (action: string) => ["audit_logs_by_action", action],
    byEntity: (
      entityType: string,
      entityId: UUID,
    ) => ["audit_logs_by_entity", entityType, entityId],
    byDate: (
      year: number,
      month: number,
      day: number,
    ) => ["audit_logs_by_date", year, month, day],
    recent: () => ["audit_logs", "recent"],
    all: () => ["audit_logs"],
  },

  // Plugin Management
  plugins: {
    byId: (id: UUID) => ["plugins", id],
    byName: (name: string) => ["plugins_by_name", name],
    active: () => ["plugins", "active"],
    config: (pluginId: UUID) => ["plugins", pluginId, "config"],
    data: (pluginId: UUID, key: string) => ["plugins", pluginId, "data", key],
    all: () => ["plugins"],
  },

  // Search Indexes
  search: {
    content: (
      locale: Locale,
      term: string,
    ) => ["search", "content", locale, term],
    users: (term: string) => ["search", "users", term],
    media: (term: string) => ["search", "media", term],
    fullText: (
      entityType: string,
      term: string,
    ) => ["search", "fulltext", entityType, term],
    tags: (tag: string) => ["search", "tags", tag],
  },

  // Cache Management
  cache: {
    byKey: (key: string) => ["cache", key],
    byTags: (tag: string) => ["cache_by_tag", tag],
    content: (contentId: UUID, locale?: Locale) =>
      locale
        ? ["cache", "content", contentId, locale]
        : ["cache", "content", contentId],
    api: (
      endpoint: string,
      params: string,
    ) => ["cache", "api", endpoint, params],
    all: () => ["cache"],
  },

  // Background Jobs
  jobs: {
    byId: (id: UUID) => ["jobs", id],
    byType: (type: string) => ["jobs_by_type", type],
    byStatus: (status: string) => ["jobs_by_status", status],
    queue: (queue: string) => ["jobs", "queue", queue],
    scheduled: () => ["jobs", "scheduled"],
    failed: () => ["jobs", "failed"],
    all: () => ["jobs"],
  },

  // Analytics
  analytics: {
    content: (
      contentId: UUID,
      period: string,
    ) => ["analytics", "content", contentId, period],
    site: (period: string) => ["analytics", "site", period],
    users: (period: string) => ["analytics", "users", period],
    api: (period: string) => ["analytics", "api", period],
    events: (
      event: string,
      period: string,
    ) => ["analytics", "events", event, period],
  },

  // Temporary data (with expiration)
  temp: {
    passwordReset: (token: string) => ["temp", "password_reset", token],
    emailVerification: (token: string) => ["temp", "email_verification", token],
    uploads: (sessionId: string) => ["temp", "uploads", sessionId],
    previews: (contentId: UUID) => ["temp", "previews", contentId],
  },
} as const;

// Utility functions for key manipulation
export class KeyBuilder {
  static join(...parts: (string | number | undefined)[]): string[] {
    return parts.filter((p) => p !== undefined).map((p) => String(p));
  }

  static pattern(pattern: string[], ...args: (string | number)[]): string[] {
    let argIndex = 0;
    return pattern.map((part) => {
      if (part.startsWith(":")) {
        return String(args[argIndex++]);
      }
      return part;
    });
  }

  static validate(key: string[]): boolean {
    // Validate key structure
    if (!Array.isArray(key) || key.length === 0) {
      return false;
    }

    // Check for valid characters in key parts
    return key.every((part) =>
      typeof part === "string" &&
      part.length > 0 &&
      /^[a-zA-Z0-9_-]+$/.test(part)
    );
  }

  static toPrefix(key: string[]): string[] {
    return key;
  }
}

// Export type-safe key builders
export type KeyPattern = typeof KeyPatterns;
export type EntityType = keyof typeof KeyPatterns;
