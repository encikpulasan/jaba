// API Types
import type { BaseEntity, Timestamp, UUID } from "./base.ts";
import type { Permission } from "./auth.ts";

export interface APIKey extends BaseEntity {
  name: string;
  key: string;
  secret: string;
  permissions: Permission[];
  rateLimit: number;
  isActive: boolean;
  lastUsedAt?: Timestamp;
  expiresAt?: Timestamp;
  metadata: Record<string, unknown>;
}

export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: APIError;
  meta?: APIResponseMeta;
}

export interface APIError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  stack?: string;
}

export interface APIResponseMeta {
  total?: number;
  page?: number;
  limit?: number;
  hasMore?: boolean;
  timestamp: Timestamp;
  version: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface FilterParams {
  search?: string;
  status?: string;
  locale?: string;
  createdBy?: UUID;
  dateFrom?: Timestamp;
  dateTo?: Timestamp;
  tags?: string[];
}

export interface WebhookEndpoint extends BaseEntity {
  name: string;
  url: string;
  secret: string;
  events: string[];
  isActive: boolean;
  headers?: Record<string, string>;
  retryPolicy: WebhookRetryPolicy;
}

export interface WebhookRetryPolicy {
  maxRetries: number;
  backoffMultiplier: number;
  maxBackoffSeconds: number;
}

export interface WebhookEvent extends BaseEntity {
  endpointId: UUID;
  event: string;
  payload: Record<string, unknown>;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  lastAttemptAt?: Timestamp;
  responseStatus?: number;
  responseBody?: string;
}
