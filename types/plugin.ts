// Plugin Types
import type { BaseEntity, Permission, UUID } from "./base.ts";

export interface Plugin extends BaseEntity {
  name: string;
  version: string;
  description: string;
  author: string;
  homepage?: string;
  repository?: string;
  license: string;
  keywords: string[];
  isActive: boolean;
  isSystem: boolean;
  manifest: PluginManifest;
  config: Record<string, unknown>;
  dependencies: PluginDependency[];
}

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  main: string;
  permissions: Permission[];
  hooks: string[];
  routes?: PluginRoute[];
  assets?: PluginAsset[];
  configuration?: PluginConfigField[];
}

export interface PluginDependency {
  name: string;
  version: string;
  optional: boolean;
}

export interface PluginRoute {
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  handler: string;
  middleware?: string[];
  permissions?: Permission[];
}

export interface PluginAsset {
  src: string;
  dest: string;
  type: "css" | "js" | "image" | "font" | "other";
}

export interface PluginConfigField {
  key: string;
  type: "string" | "number" | "boolean" | "array" | "object";
  label: string;
  description?: string;
  required: boolean;
  defaultValue?: unknown;
  validation?: Record<string, unknown>;
}

export interface PluginHook {
  name: string;
  description: string;
  parameters: PluginHookParameter[];
  returnType?: string;
}

export interface PluginHookParameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
}
