// Authentication Types
import type { BaseEntity, Email, Permission, Timestamp, UUID } from "./base.ts";

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
  twoFactorEnabled: boolean;
  twoFactorSecret?: string;
  roles: Role[];
  preferences: UserPreferences;
  metadata: Record<string, unknown>;
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
  email: Email;
  roles: string[];
  permissions: Permission[];
  sessionId: UUID;
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
