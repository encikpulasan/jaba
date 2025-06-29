// Base Types - Core type definitions to avoid circular dependencies

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

// Permission types - removing from base.ts to avoid conflicts with auth.ts
// Now exported from auth.ts module
