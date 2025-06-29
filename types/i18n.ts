// Internationalization Types
import type { BaseEntity, Locale, UUID } from "./base.ts";

export interface Translation extends BaseEntity {
  key: string;
  locale: Locale;
  value: string;
  namespace: string;
}

export interface TranslationNamespace extends BaseEntity {
  name: string;
  description?: string;
  isDefault: boolean;
}

export interface LanguageConfig {
  code: Locale;
  name: string;
  nativeName: string;
  rtl: boolean;
  enabled: boolean;
  isDefault: boolean;
  dateFormat: string;
  timeFormat: string;
  currency?: string;
}

export interface TranslationMemory {
  sourceText: string;
  targetText: string;
  sourceLocale: Locale;
  targetLocale: Locale;
  confidence: number;
  usage: number;
  lastUsedAt: number;
}

// Locale Configuration
export interface LocaleConfig {
  code: string;
  name: string;
  nativeName: string;
  enabled: boolean;
  rtl?: boolean;
  hreflang?: string;
  pluralRule?: PluralRule;
}

export type PluralRule = "simple" | "slavic" | "complex";
