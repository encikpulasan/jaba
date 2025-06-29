// Content Types
import type {
  Auditable,
  BaseEntity,
  Locale,
  MultilingualEntity,
  PublishStatus,
  Slug,
  SoftDeletable,
  Timestamp,
  UUID,
  WorkflowStatus,
} from "./base.ts";

export interface Content extends MultilingualEntity, Auditable, SoftDeletable {
  title: string;
  slug: Slug;
  summary?: string;
  body: string;
  excerpt?: string;
  contentType: string;
  schema: ContentSchema;
  fields: Record<string, ContentFieldValue>;
  status: PublishStatus;
  workflowStatus: WorkflowStatus;
  tags: string[];
  categories: string[];
  featuredImage?: UUID;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string[];
  publishedAt?: Timestamp;
  scheduledAt?: Timestamp;
  viewCount: number;
  author: UUID;
  collaborators: UUID[];
  parentId?: UUID;
  children?: UUID[];
  relatedContent?: UUID[];
  metadata: Record<string, unknown>;
}

export interface ContentSchema extends BaseEntity {
  name: string;
  description: string;
  icon?: string;
  fields: ContentFieldDefinition[];
  isSystem: boolean;
  template?: string;
  permissions: Record<string, string[]>;
}

export interface ContentFieldDefinition {
  id: string;
  name: string;
  type: ContentFieldType;
  required: boolean;
  unique: boolean;
  multilingual: boolean;
  defaultValue?: ContentFieldValue;
  validation?: ContentFieldValidation;
  options?: ContentFieldOptions;
  helpText?: string;
  placeholder?: string;
  group?: string;
  order: number;
}

export type ContentFieldType =
  | "text"
  | "textarea"
  | "markdown"
  | "richtext"
  | "number"
  | "boolean"
  | "date"
  | "datetime"
  | "email"
  | "url"
  | "image"
  | "file"
  | "select"
  | "multiselect"
  | "json"
  | "relation"
  | "array";

export type ContentFieldValue =
  | string
  | number
  | boolean
  | Date
  | Record<string, unknown>
  | unknown[]
  | null;

export interface ContentFieldValidation {
  min?: number;
  max?: number;
  pattern?: string;
  required?: boolean;
  custom?: string;
}

export interface ContentFieldOptions {
  choices?: Array<{ value: string; label: string }>;
  multiple?: boolean;
  allowEmpty?: boolean;
  relationTo?: string;
  relationMany?: boolean;
}

export interface ContentVersion extends BaseEntity {
  contentId: UUID;
  version: number;
  title: string;
  body: string;
  fields: Record<string, ContentFieldValue>;
  status: PublishStatus;
  publishedAt?: Timestamp;
  author: UUID;
  changes: string;
  metadata: Record<string, unknown>;
}

export interface ContentTemplate extends BaseEntity {
  name: string;
  description?: string;
  contentType: string;
  fields: Record<string, ContentFieldValue>;
  isGlobal: boolean;
  previewImage?: string;
  category?: string;
}

export interface ContentComment extends BaseEntity {
  contentId: UUID;
  userId: UUID;
  message: string;
  resolved: boolean;
  resolvedBy?: UUID;
  resolvedAt?: Timestamp;
  parentId?: UUID;
  mentions: UUID[];
}

export interface ContentAnalytics {
  contentId: UUID;
  views: number;
  uniqueViews: number;
  avgTimeOnPage: number;
  bounceRate: number;
  shares: number;
  comments: number;
  likes: number;
  lastViewedAt: Timestamp;
  topReferrers: Array<{ url: string; count: number }>;
  topCountries: Array<{ country: string; count: number }>;
}
