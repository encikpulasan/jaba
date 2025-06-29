// masmaCMS - Core Type Definitions
// Enterprise Headless CMS Types with Multilanguage Support

export * from "./auth.ts";
export * from "./content.ts";
export * from "./user.ts";
export * from "./i18n.ts";
export * from "./media.ts";
export * from "./workflow.ts";
export * from "./api.ts";
export * from "./settings.ts";
export * from "./plugin.ts";
export * from "./database.ts";

// Common utility types
export type UUID = string;
export type Timestamp = number;
export type Locale = string;
export type Slug = string;
export type Email = string;
export type URL = string;

// Base entity interface
export interface BaseEntity {
  id: UUID;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy?: UUID;
  updatedBy?: UUID;
}

// Multilanguage base interface
export interface MultilingualEntity extends BaseEntity {
  locale: Locale;
  defaultLocale: Locale;
  translations?: Record<Locale, Partial<MultilingualEntity>>;
}

// Soft delete interface
export interface SoftDeletable {
  deletedAt?: Timestamp;
  deletedBy?: UUID;
  isDeleted: boolean;
}

// Audit interface
export interface Auditable extends BaseEntity {
  version: number;
  auditLog: AuditEntry[];
}

export interface AuditEntry {
  id: UUID;
  action: "CREATE" | "UPDATE" | "DELETE" | "RESTORE";
  userId: UUID;
  timestamp: Timestamp;
  changes: Record<string, { old: unknown; new: unknown }>;
  ip?: string;
  userAgent?: string;
}

// Status types
export type PublishStatus = "draft" | "published" | "archived" | "scheduled";
export type WorkflowStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "published"
  | "rejected";
export type UserStatus = "active" | "inactive" | "suspended" | "pending";

// Permission types
export type Permission =
  | "content.create"
  | "content.read"
  | "content.update"
  | "content.delete"
  | "content.publish"
  | "user.create"
  | "user.read"
  | "user.update"
  | "user.delete"
  | "admin.settings"
  | "admin.system"
  | "workflow.manage"
  | "media.upload"
  | "media.delete"
  | "plugin.install"
  | "plugin.configure";

// Error types
export interface CMSError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  stack?: string;
}

// API Response types
export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: CMSError;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    hasMore?: boolean;
  };
}

// Pagination types
export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

// Filter types
export interface FilterParams {
  search?: string;
  status?: string;
  locale?: Locale;
  createdBy?: UUID;
  dateFrom?: Timestamp;
  dateTo?: Timestamp;
  tags?: string[];
}

// Environment configuration
export interface EnvironmentConfig {
  NODE_ENV: "development" | "staging" | "production";
  PORT: number;
  DATABASE_URL?: string;
  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;
  ADMIN_EMAIL: Email;
  ADMIN_PASSWORD: string;
  SMTP_HOST?: string;
  SMTP_PORT?: number;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  UPLOAD_MAX_SIZE: number;
  UPLOAD_ALLOWED_TYPES: string[];
  CACHE_TTL: number;
  RATE_LIMIT_REQUESTS: number;
  RATE_LIMIT_WINDOW: number;
}
