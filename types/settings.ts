// Settings Types
import type { BaseEntity, Locale } from "./base.ts";

export interface SystemSettings extends BaseEntity {
  siteName: string;
  siteDescription: string;
  defaultLocale: Locale;
  availableLocales: Locale[];
  timezone: string;
  dateFormat: string;
  timeFormat: string;
  emailFrom: string;
  emailReplyTo: string;
  maintenanceMode: boolean;
  registrationEnabled: boolean;
  emailVerificationRequired: boolean;
  twoFactorRequired: boolean;
  maxFileSize: number;
  allowedFileTypes: string[];
  seoSettings: SEOSettings;
  cacheSettings: CacheSettings;
  securitySettings: SecuritySettings;
}

export interface SEOSettings {
  defaultTitle: string;
  defaultDescription: string;
  defaultKeywords: string[];
  titleSeparator: string;
  noIndex: boolean;
  openGraphEnabled: boolean;
  twitterCardEnabled: boolean;
  structuredDataEnabled: boolean;
}

export interface CacheSettings {
  enabled: boolean;
  ttl: number;
  maxSize: number;
  strategy: "lru" | "fifo" | "ttl";
}

export interface SecuritySettings {
  passwordMinLength: number;
  passwordRequireUppercase: boolean;
  passwordRequireLowercase: boolean;
  passwordRequireNumbers: boolean;
  passwordRequireSymbols: boolean;
  sessionTimeout: number;
  maxLoginAttempts: number;
  lockoutDuration: number;
  ipWhitelist: string[];
  corsOrigins: string[];
  rateLimiting: RateLimitSettings;
}

export interface RateLimitSettings {
  enabled: boolean;
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests: boolean;
  skipFailedRequests: boolean;
}

export interface EmailSettings {
  provider: "smtp" | "sendgrid" | "mailgun" | "ses";
  host?: string;
  port?: number;
  secure?: boolean;
  username?: string;
  password?: string;
  apiKey?: string;
  templates: EmailTemplate[];
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  isHtml: boolean;
  variables: string[];
}
