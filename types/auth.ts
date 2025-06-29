// Authentication Types
import type { BaseEntity, Email, Timestamp, UUID } from "./base.ts";

// Core permissions
export type Permission =
  // Content Management
  | "create_content"
  | "edit_content"
  | "edit_own_content"
  | "delete_content"
  | "delete_own_content"
  | "publish_content"
  | "view_content"
  | "view_unpublished_content"
  // Media Management
  | "upload_media"
  | "edit_media"
  | "delete_media"
  | "view_media"
  | "view_own_media"
  // User Management
  | "create_users"
  | "edit_users"
  | "delete_users"
  | "view_users"
  | "manage_roles"
  | "view_roles"
  // System Administration
  | "view_system_settings"
  | "edit_system_settings"
  | "manage_backups"
  | "view_audit_logs"
  | "manage_plugins"
  // Translation & Internationalization
  | "create_translations"
  | "edit_translations"
  | "delete_translations"
  | "view_translations"
  | "manage_locales"
  | "review_translations"
  // Workflow Management
  | "create_workflows"
  | "edit_workflows"
  | "delete_workflows"
  | "view_workflows"
  | "execute_workflows"
  // API Key Management
  | "manage_api_keys"
  | "manage_all_api_keys"
  | "view_api_usage";

export interface User extends BaseEntity {
  email: Email;
  username: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  status: "active" | "inactive" | "suspended" | "pending";
  emailVerified: boolean;
  emailVerifiedAt?: Timestamp;
  lastLoginAt?: Timestamp;
  lastLoginIp?: string;
  twoFactorEnabled: boolean;
  twoFactorSecret?: string;
  roles: Role[];
  preferences: UserPreferences;
  metadata: Record<string, unknown>;
  // Additional properties for internal use
  password?: string; // Hashed password
  passwordHistory?: string[]; // Array of hashed passwords
  passwordChangedAt?: Timestamp;
  isActive?: boolean; // Computed from status
  locale?: string; // User's preferred locale
}

export interface Role extends BaseEntity {
  name: string;
  description: string;
  permissions: Permission[];
  isDefault: boolean;
  metadata: Record<string, unknown>;
}

export interface UserPreferences {
  locale: string;
  timezone: string;
  theme: "light" | "dark" | "system";
  notifications: NotificationPreferences;
}

export interface NotificationPreferences {
  email: boolean;
  push: boolean;
  inApp: boolean;
  digest: "never" | "daily" | "weekly";
}

export interface Session extends BaseEntity {
  userId: UUID;
  token: string;
  refreshToken: string;
  expiresAt: Timestamp;
  deviceInfo: DeviceInfo;
  ipAddress: string;
  userAgent: string;
  isActive: boolean;
}

export interface DeviceInfo {
  type: "desktop" | "mobile" | "tablet";
  os: string;
  browser: string;
  location?: string;
}

export interface LoginCredentials {
  email: Email;
  password: string;
  rememberMe?: boolean;
  twoFactorCode?: string;
}

export interface RegisterCredentials {
  email: Email;
  username: string;
  firstName: string;
  lastName: string;
  password: string;
  confirmPassword: string;
  locale?: string;
}

export interface AuthResponse {
  user: User;
  session: Session;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface JWTPayload {
  sub: UUID; // user id
  userId: UUID; // for compatibility
  email: Email;
  username: string;
  roles: string[];
  permissions: Permission[];
  sessionId: UUID;
  locale?: string;
  iat: number;
  exp: number;
  aud: string;
  iss: string;
}

export interface PasswordResetRequest {
  email: Email;
  token: string;
  expiresAt: Timestamp;
  usedAt?: Timestamp;
}

export interface TwoFactorSetup {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

// API Key Management Types
export interface ApiKey {
  id: UUID;
  name: string;
  key: string; // Truncated display version
  prefix: string;
  hashedKey: string;
  userId: UUID;
  permissions: Permission[];
  scopes: string[];
  expiresAt?: number;
  lastUsedAt?: number;
  usageCount: number;
  rateLimit?: {
    requests: number;
    window: number;
  };
  ipWhitelist?: string[];
  environment?: "development" | "staging" | "production" | "all";
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface ApiKeyUsage {
  id: UUID;
  apiKeyId: UUID;
  endpoint: string;
  method: string;
  ipAddress: string;
  userAgent?: string;
  timestamp: number;
  responseStatus: number;
  responseTime: number;
  payload?: {
    size: number;
    type: string;
  };
}

export interface CreateApiKeyRequest {
  name: string;
  permissions: Permission[];
  scopes?: string[];
  expiresAt?: number;
  rateLimit?: {
    requests: number;
    window: number;
  };
  ipWhitelist?: string[];
  environment?: "development" | "staging" | "production" | "all";
  metadata?: Record<string, unknown>;
}

// Additional missing type definitions
export interface CreateUserData {
  email: Email;
  username: string;
  firstName: string;
  lastName: string;
  locale?: string;
  timezone?: string;
}

export interface LoginRequest {
  email: Email;
  password: string;
  rememberMe?: boolean;
  twoFactorCode?: string;
}

export interface RegisterRequest {
  email: Email;
  username: string;
  firstName: string;
  lastName: string;
  password: string;
  confirmPassword: string;
  locale?: string;
}

export interface JWTTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface SessionData {
  userId: UUID;
  sessionId: UUID;
  email: Email;
  username: string;
  roles: string[];
  permissions: Permission[];
  locale?: string;
  expiresAt: number;
}

// Authentication Context for middleware
export interface AuthContext {
  user: User;
  session: Session;
  permissions: Permission[];
  roles: string[];
}
