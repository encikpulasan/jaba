// Plugin System Type Definitions
// Comprehensive types for extensible plugin architecture

import type { BaseEntity, UUID } from "./base.ts";
import type { User } from "./user.ts";

// Plugin Core Types
export type PluginStatus =
  | "active"
  | "inactive"
  | "error"
  | "installing"
  | "uninstalling";
export type PluginType =
  | "extension"
  | "theme"
  | "integration"
  | "workflow"
  | "content-type"
  | "widget"
  | "utility";
export type HookPriority = "highest" | "high" | "normal" | "low" | "lowest";
export type PluginPermission = "read" | "write" | "admin" | "system";

// Plugin Manifest and Metadata
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: PluginAuthor;
  type: PluginType;
  category?: string;
  tags?: string[];

  // Requirements
  minCmsVersion: string;
  maxCmsVersion?: string;
  denoVersion?: string;
  dependencies?: PluginDependency[];

  // Entry points
  main: string; // Main plugin file
  config?: string; // Configuration schema file
  assets?: string[]; // Static assets (CSS, JS, images)

  // Permissions
  permissions: PluginPermission[];
  hooks?: string[]; // Hooks this plugin uses
  provides?: string[]; // Services this plugin provides

  // Metadata
  homepage?: string;
  repository?: string;
  license: string;
  keywords?: string[];
  screenshots?: string[];
  changelog?: string;

  // Advanced features
  sandboxed?: boolean;
  experimental?: boolean;
  premium?: boolean;
}

export interface PluginAuthor {
  name: string;
  email?: string;
  url?: string;
  organization?: string;
}

export interface PluginDependency {
  id: string;
  version: string; // Semver range
  optional?: boolean;
  reason?: string;
}

// Plugin Instance Management
export interface Plugin extends BaseEntity {
  manifestId: string; // References PluginManifest.id
  organizationId?: UUID; // Organization-scoped plugins
  userId?: UUID; // User who installed the plugin

  status: PluginStatus;
  version: string;
  installedVersion?: string;

  // Configuration
  config: Record<string, any>;
  settings: PluginSettings;

  // Runtime information
  loadedAt?: Date;
  lastError?: string;
  errorCount: number;

  // Usage statistics
  stats: PluginStats;

  // Installation metadata
  installSource?: "store" | "upload" | "development";
  checksum?: string;
  signature?: string;
}

export interface PluginSettings {
  enabled: boolean;
  autoUpdate: boolean;
  priority: number;
  environment: "production" | "development" | "testing";
  debugMode: boolean;
  logLevel: "error" | "warn" | "info" | "debug";

  // Security settings
  trustedDomains?: string[];
  allowedAPIs?: string[];
  resourceLimits?: PluginResourceLimits;

  // UI settings
  showInMenu?: boolean;
  menuPosition?: number;
  iconUrl?: string;
  theme?: Record<string, any>;
}

export interface PluginResourceLimits {
  maxMemory?: number; // MB
  maxCpuTime?: number; // milliseconds
  maxDiskSpace?: number; // MB
  maxNetworkRequests?: number;
  maxFileOperations?: number;
}

export interface PluginStats {
  timesLoaded: number;
  timesExecuted: number;
  averageExecutionTime: number;
  lastExecutedAt?: Date;
  memoryUsage: number;
  errors: number;
  warnings: number;
}

// Hook System
export interface Hook {
  name: string;
  description: string;
  type: HookType;
  parameters: HookParameter[];
  returnType?: string;
  category: string;
  examples?: HookExample[];
}

export type HookType = "filter" | "action" | "event" | "middleware";

export interface HookParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
  default?: any;
}

export interface HookExample {
  title: string;
  description: string;
  code: string;
}

export interface HookRegistration {
  id: UUID;
  pluginId: string;
  hookName: string;
  callback: string; // Function name or code reference
  priority: HookPriority;
  condition?: string; // Optional condition for execution
  enabled: boolean;
  registeredAt: Date;
}

// Plugin API Context
export interface PluginContext {
  plugin: Plugin;
  manifest: PluginManifest;
  organization?: UUID;
  user?: User;
  request?: PluginRequest;

  // Core API access
  api: PluginAPI;
  hooks: PluginHookManager;
  storage: PluginStorage;
  logger: PluginLogger;
  config: PluginConfigManager;

  // Security context
  permissions: string[];
  sandbox: PluginSandbox;
}

export interface PluginRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: any;
  query?: Record<string, string>;
  params?: Record<string, string>;
}

// Plugin API Interfaces
export interface PluginAPI {
  // Content management
  content: {
    create(data: any): Promise<any>;
    update(id: UUID, data: any): Promise<any>;
    delete(id: UUID): Promise<boolean>;
    find(query: any): Promise<any[]>;
    findById(id: UUID): Promise<any>;
  };

  // Media management
  media: {
    upload(file: File, options?: any): Promise<any>;
    delete(id: UUID): Promise<boolean>;
    find(query: any): Promise<any[]>;
    getUrl(id: UUID): Promise<string>;
  };

  // User management
  users: {
    findById(id: UUID): Promise<User | null>;
    find(query: any): Promise<User[]>;
    getCurrentUser(): Promise<User | null>;
    hasPermission(permission: string): Promise<boolean>;
  };

  // Organization management
  organizations: {
    getCurrent(): Promise<any>;
    getSettings(): Promise<any>;
    updateSettings(settings: any): Promise<any>;
  };

  // HTTP utilities
  http: {
    get(url: string, options?: any): Promise<Response>;
    post(url: string, data: any, options?: any): Promise<Response>;
    put(url: string, data: any, options?: any): Promise<Response>;
    delete(url: string, options?: any): Promise<Response>;
  };

  // Database access (limited)
  db: {
    get(key: string): Promise<any>;
    set(key: string, value: any): Promise<void>;
    delete(key: string): Promise<void>;
    list(prefix: string): Promise<any[]>;
  };

  // Cache utilities
  cache: {
    get(key: string): Promise<any>;
    set(key: string, value: any, ttl?: number): Promise<void>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;
  };

  // Event system
  events: {
    emit(event: string, data: any): Promise<void>;
    on(event: string, callback: Function): void;
    off(event: string, callback: Function): void;
  };
}

export interface PluginHookManager {
  register(hookName: string, callback: Function, priority?: HookPriority): void;
  unregister(hookName: string, callback: Function): void;
  execute(hookName: string, ...args: any[]): Promise<any>;
  filter(hookName: string, value: any, ...args: any[]): Promise<any>;
}

export interface PluginStorage {
  get(key: string): Promise<any>;
  set(key: string, value: any): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
  size(): Promise<number>;
}

export interface PluginLogger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, error?: Error, ...args: any[]): void;
  trace(message: string, ...args: any[]): void;
}

export interface PluginConfigManager {
  get<T = any>(key: string, defaultValue?: T): T;
  set(key: string, value: any): Promise<void>;
  has(key: string): boolean;
  delete(key: string): Promise<void>;
  getAll(): Record<string, any>;
  validate(): Promise<ValidationResult>;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  value?: any;
}

export interface ValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
}

export interface PluginSandbox {
  isEnabled: boolean;
  allowedModules: string[];
  restrictedAPIs: string[];
  resourceLimits: PluginResourceLimits;
  executeInSandbox<T>(code: string, context: any): Promise<T>;
}

// Plugin Registry and Store
export interface PluginRegistry extends BaseEntity {
  plugins: PluginManifest[];
  categories: PluginCategory[];
  featured: string[]; // Plugin IDs
  trending: string[]; // Plugin IDs
  lastUpdated: Date;
  version: string;
}

export interface PluginCategory {
  id: string;
  name: string;
  description: string;
  icon?: string;
  parent?: string;
  pluginCount: number;
}

export interface PluginStore {
  search(query: PluginSearchQuery): Promise<PluginSearchResult>;
  get(pluginId: string): Promise<PluginStoreEntry | null>;
  install(pluginId: string, version?: string): Promise<PluginInstallResult>;
  uninstall(pluginId: string): Promise<boolean>;
  update(pluginId: string, version?: string): Promise<PluginUpdateResult>;
  getUpdates(): Promise<PluginUpdate[]>;
}

export interface PluginSearchQuery {
  query?: string;
  category?: string;
  type?: PluginType;
  author?: string;
  tags?: string[];
  minRating?: number;
  free?: boolean;
  featured?: boolean;
  sort?: "relevance" | "rating" | "downloads" | "updated" | "name";
  limit?: number;
  offset?: number;
}

export interface PluginSearchResult {
  plugins: PluginStoreEntry[];
  total: number;
  facets: PluginSearchFacets;
}

export interface PluginSearchFacets {
  categories: Array<{ name: string; count: number }>;
  types: Array<{ name: string; count: number }>;
  authors: Array<{ name: string; count: number }>;
  tags: Array<{ name: string; count: number }>;
}

export interface PluginStoreEntry extends PluginManifest {
  rating: number;
  ratingCount: number;
  downloads: number;
  reviews: PluginReview[];
  pricing: PluginPricing;
  publisher: PluginPublisher;
  publishedAt: Date;
  lastUpdated: Date;
  compatibility: PluginCompatibility;
}

export interface PluginReview {
  id: UUID;
  userId: UUID;
  userName: string;
  rating: number;
  title: string;
  content: string;
  createdAt: Date;
  helpful: number;
  version: string;
}

export interface PluginPricing {
  type: "free" | "paid" | "freemium" | "subscription";
  price?: number;
  currency?: string;
  billingPeriod?: "monthly" | "yearly" | "one-time";
  trialDays?: number;
  features?: PluginFeature[];
}

export interface PluginFeature {
  name: string;
  description: string;
  included: boolean;
  premium?: boolean;
}

export interface PluginPublisher {
  id: UUID;
  name: string;
  email: string;
  website?: string;
  verified: boolean;
  reputation: number;
  pluginCount: number;
}

export interface PluginCompatibility {
  cmsVersions: string[];
  denoVersions: string[];
  platforms: string[];
  conflicts?: string[]; // Plugin IDs that conflict
  tested: boolean;
}

export interface PluginInstallResult {
  success: boolean;
  plugin?: Plugin;
  error?: string;
  warnings?: string[];
  dependencies?: Plugin[];
}

export interface PluginUpdateResult {
  success: boolean;
  oldVersion: string;
  newVersion: string;
  changelog?: string;
  error?: string;
  requiresRestart?: boolean;
}

export interface PluginUpdate {
  pluginId: string;
  currentVersion: string;
  availableVersion: string;
  type: "major" | "minor" | "patch" | "security";
  changelog?: string;
  important?: boolean;
  autoUpdate?: boolean;
}

// Plugin Development Tools
export interface PluginSDK {
  create(template: string, options: PluginCreateOptions): Promise<string>;
  validate(pluginPath: string): Promise<ValidationResult>;
  build(
    pluginPath: string,
    options?: PluginBuildOptions,
  ): Promise<PluginBuildResult>;
  test(
    pluginPath: string,
    options?: PluginTestOptions,
  ): Promise<PluginTestResult>;
  package(pluginPath: string, options?: PluginPackageOptions): Promise<string>;
  publish(
    packagePath: string,
    options?: PluginPublishOptions,
  ): Promise<boolean>;
}

export interface PluginCreateOptions {
  name: string;
  author: string;
  description: string;
  type: PluginType;
  typescript?: boolean;
  git?: boolean;
  license?: string;
}

export interface PluginBuildOptions {
  minify?: boolean;
  sourceMaps?: boolean;
  target?: string;
  outputDir?: string;
}

export interface PluginBuildResult {
  success: boolean;
  outputPath: string;
  assets: string[];
  size: number;
  errors?: string[];
  warnings?: string[];
}

export interface PluginTestOptions {
  coverage?: boolean;
  watch?: boolean;
  pattern?: string;
}

export interface PluginTestResult {
  success: boolean;
  passed: number;
  failed: number;
  total: number;
  coverage?: number;
  errors?: string[];
}

export interface PluginPackageOptions {
  outputPath?: string;
  includeSource?: boolean;
  sign?: boolean;
}

export interface PluginPublishOptions {
  registry?: string;
  apiKey?: string;
  dryRun?: boolean;
}

// Plugin Events and Lifecycle
export interface PluginEvent {
  type: PluginEventType;
  pluginId: string;
  timestamp: Date;
  data?: any;
  error?: string;
}

export type PluginEventType =
  | "install"
  | "uninstall"
  | "enable"
  | "disable"
  | "update"
  | "error"
  | "load"
  | "unload"
  | "config_change";

export interface PluginLifecycle {
  onInstall?(context: PluginContext): Promise<void>;
  onUninstall?(context: PluginContext): Promise<void>;
  onEnable?(context: PluginContext): Promise<void>;
  onDisable?(context: PluginContext): Promise<void>;
  onUpdate?(context: PluginContext, oldVersion: string): Promise<void>;
  onLoad?(context: PluginContext): Promise<void>;
  onUnload?(context: PluginContext): Promise<void>;
  onConfigChange?(context: PluginContext, changes: any): Promise<void>;
}

// Plugin Security and Permissions
export interface PluginSecurityPolicy {
  sandboxed: boolean;
  allowedAPIs: string[];
  restrictedAPIs: string[];
  allowedDomains: string[];
  allowedModules: string[];
  resourceLimits: PluginResourceLimits;
  requiresReview: boolean;
  trustedPublisher: boolean;
}

export interface PluginAuditLog extends BaseEntity {
  pluginId: string;
  action: string;
  userId?: UUID;
  organizationId?: UUID;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  error?: string;
}
