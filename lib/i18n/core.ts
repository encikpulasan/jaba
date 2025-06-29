// Core Internationalization System
// Comprehensive i18n infrastructure for masmaCMS

import type {
  FormatOptions,
  Locale,
  LocaleConfig,
  PluralRule,
  TranslationKey,
  TranslationNamespace,
} from "@/types";
import { db } from "@/lib/db/mod.ts";
import { KeyPatterns } from "@/lib/db/patterns.ts";

export class I18nManager {
  private static instance: I18nManager;
  private locales = new Map<Locale, LocaleConfig>();
  private translations = new Map<string, Record<string, unknown>>();
  private defaultLocale: Locale = "en";
  private currentLocale: Locale = "en";
  private fallbackLocale: Locale = "en";

  private constructor() {}

  static getInstance(): I18nManager {
    if (!I18nManager.instance) {
      I18nManager.instance = new I18nManager();
    }
    return I18nManager.instance;
  }

  // Initialize i18n system
  async initialize(options?: {
    defaultLocale?: Locale;
    fallbackLocale?: Locale;
    preloadNamespaces?: string[];
  }): Promise<void> {
    if (options?.defaultLocale) {
      this.defaultLocale = options.defaultLocale;
    }
    if (options?.fallbackLocale) {
      this.fallbackLocale = options.fallbackLocale;
    }
    this.currentLocale = this.defaultLocale;

    // Load available locales
    await this.loadAvailableLocales();

    // Preload common namespaces
    const namespacesToLoad = options?.preloadNamespaces ||
      ["common", "ui", "validation"];
    await this.preloadNamespaces(namespacesToLoad);

    console.log(`🌍 I18n initialized with locale: ${this.currentLocale}`);
  }

  // Load available locales from database
  private async loadAvailableLocales(): Promise<void> {
    try {
      const connection = db.getConnection();
      const iterator = (connection.kv as Deno.Kv).list<LocaleConfig>({
        prefix: KeyPatterns.translations.locales(),
      });

      for await (const { key, value } of iterator) {
        if (value) {
          const localeCode = key[key.length - 1] as Locale;
          this.locales.set(localeCode, value);
        }
      }

      console.log(`📍 Loaded ${this.locales.size} locales`);
    } catch (error) {
      console.error("Failed to load locales:", error);
    }
  }

  // Get current locale
  getCurrentLocale(): Locale {
    return this.currentLocale;
  }

  // Set current locale
  async setCurrentLocale(locale: Locale): Promise<boolean> {
    if (!this.locales.has(locale)) {
      console.warn(`Locale ${locale} is not available`);
      return false;
    }

    this.currentLocale = locale;

    // Preload common namespaces for new locale
    await this.preloadNamespaces(["common", "ui", "validation"]);

    return true;
  }

  // Get available locales
  getAvailableLocales(): LocaleConfig[] {
    return Array.from(this.locales.values()).filter((locale) => locale.enabled);
  }

  // Get locale configuration
  getLocaleConfig(locale: Locale): LocaleConfig | null {
    return this.locales.get(locale) || null;
  }

  // Translate a key
  async t(
    key: TranslationKey,
    options?: {
      locale?: Locale;
      namespace?: string;
      defaultValue?: string;
      interpolation?: Record<string, unknown>;
      count?: number;
    },
  ): Promise<string> {
    const locale = options?.locale || this.currentLocale;
    const namespace = options?.namespace || "common";
    const cacheKey = `${locale}:${namespace}`;

    // Ensure namespace is loaded
    await this.loadNamespace(namespace, locale);

    // Get translations for namespace
    const namespaceTranslations = this.translations.get(cacheKey);

    if (!namespaceTranslations) {
      return options?.defaultValue || key;
    }

    // Handle nested keys (e.g., "user.profile.name")
    const translation = this.getNestedValue(namespaceTranslations, key);

    if (!translation) {
      // Try fallback locale
      if (locale !== this.fallbackLocale) {
        return await this.t(key, {
          ...options,
          locale: this.fallbackLocale,
        });
      }
      return options?.defaultValue || key;
    }

    let result = String(translation);

    // Handle pluralization
    if (options?.count !== undefined && typeof translation === "object") {
      result = this.handlePluralization(
        translation as Record<string, string>,
        options.count,
        locale,
      );
    }

    // Handle interpolation
    if (options?.interpolation) {
      result = this.interpolate(result, options.interpolation);
    }

    return result;
  }

  // Load translation namespace for a locale
  async loadNamespace(namespace: string, locale: Locale): Promise<void> {
    const cacheKey = `${locale}:${namespace}`;

    if (this.translations.has(cacheKey)) {
      return; // Already loaded
    }

    try {
      const connection = db.getConnection();
      const result = await (connection.kv as Deno.Kv).get<
        Record<string, unknown>
      >(
        KeyPatterns.translations.byNamespace(namespace, locale),
      );

      if (result.value) {
        this.translations.set(cacheKey, result.value);
      } else {
        // Try to load from fallback locale
        if (locale !== this.fallbackLocale) {
          const fallbackResult = await (connection.kv as Deno.Kv).get<
            Record<string, unknown>
          >(
            KeyPatterns.translations.byNamespace(
              namespace,
              this.fallbackLocale,
            ),
          );

          if (fallbackResult.value) {
            this.translations.set(cacheKey, fallbackResult.value);
          }
        }
      }
    } catch (error) {
      console.error(
        `Failed to load namespace ${namespace} for locale ${locale}:`,
        error,
      );
    }
  }

  // Preload translation namespaces
  private async preloadNamespaces(namespaces: string[]): Promise<void> {
    const loadPromises = namespaces.map((namespace) =>
      this.loadNamespace(namespace, this.currentLocale)
    );
    await Promise.all(loadPromises);
  }

  // Handle nested object access for translation keys
  private getNestedValue(obj: Record<string, unknown>, key: string): unknown {
    return key.split(".").reduce((current, segment) => {
      return current && typeof current === "object"
        ? (current as Record<string, unknown>)[segment]
        : undefined;
    }, obj);
  }

  // Handle pluralization based on count
  private handlePluralization(
    translations: Record<string, string>,
    count: number,
    locale: Locale,
  ): string {
    const localeConfig = this.getLocaleConfig(locale);
    const pluralRule = localeConfig?.pluralRule || "simple";

    // Determine plural form based on rule
    let form: string;

    switch (pluralRule) {
      case "simple":
        form = count === 1 ? "one" : "other";
        break;
      case "slavic": // Russian, Polish, etc.
        if (count % 10 === 1 && count % 100 !== 11) {
          form = "one";
        } else if (
          [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)
        ) {
          form = "few";
        } else {
          form = "many";
        }
        break;
      case "complex": // Arabic, etc.
        if (count === 0) form = "zero";
        else if (count === 1) form = "one";
        else if (count === 2) form = "two";
        else if (count >= 3 && count <= 10) form = "few";
        else if (count >= 11) form = "many";
        else form = "other";
        break;
      default:
        form = count === 1 ? "one" : "other";
    }

    return translations[form] || translations["other"] || String(count);
  }

  // Interpolate variables into translation string
  private interpolate(
    text: string,
    variables: Record<string, unknown>,
  ): string {
    return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const value = variables[key];
      return value !== undefined ? String(value) : match;
    });
  }

  // Format number based on locale
  formatNumber(
    value: number,
    options?: {
      locale?: Locale;
      style?: "decimal" | "currency" | "percent";
      currency?: string;
      minimumFractionDigits?: number;
      maximumFractionDigits?: number;
    },
  ): string {
    const locale = options?.locale || this.currentLocale;
    const localeConfig = this.getLocaleConfig(locale);

    try {
      return new Intl.NumberFormat(localeConfig?.code || locale, {
        style: options?.style || "decimal",
        currency: options?.currency,
        minimumFractionDigits: options?.minimumFractionDigits,
        maximumFractionDigits: options?.maximumFractionDigits,
      }).format(value);
    } catch (error) {
      console.error("Number formatting failed:", error);
      return String(value);
    }
  }

  // Format date based on locale
  formatDate(
    date: Date | number | string,
    options?: {
      locale?: Locale;
      style?: "full" | "long" | "medium" | "short";
      dateStyle?: "full" | "long" | "medium" | "short";
      timeStyle?: "full" | "long" | "medium" | "short";
    },
  ): string {
    const locale = options?.locale || this.currentLocale;
    const localeConfig = this.getLocaleConfig(locale);
    const dateObj = new Date(date);

    try {
      return new Intl.DateTimeFormat(localeConfig?.code || locale, {
        dateStyle: options?.dateStyle || options?.style,
        timeStyle: options?.timeStyle,
      }).format(dateObj);
    } catch (error) {
      console.error("Date formatting failed:", error);
      return String(dateObj);
    }
  }

  // Check if locale uses RTL direction
  isRTL(locale?: Locale): boolean {
    const targetLocale = locale || this.currentLocale;
    const localeConfig = this.getLocaleConfig(targetLocale);
    return localeConfig?.rtl || false;
  }

  // Get text direction for locale
  getDirection(locale?: Locale): "ltr" | "rtl" {
    return this.isRTL(locale) ? "rtl" : "ltr";
  }
}

// Export singleton instance
export const i18n = I18nManager.getInstance();

// Helper functions for easier usage
export async function t(
  key: TranslationKey,
  options?: Parameters<typeof i18n.t>[1],
): Promise<string> {
  return await i18n.t(key, options);
}

export function formatNumber(
  value: number,
  options?: Parameters<typeof i18n.formatNumber>[1],
): string {
  return i18n.formatNumber(value, options);
}

export function formatDate(
  date: Date | number | string,
  options?: Parameters<typeof i18n.formatDate>[1],
): string {
  return i18n.formatDate(date, options);
}

export function isRTL(locale?: Locale): boolean {
  return i18n.isRTL(locale);
}

export function getDirection(locale?: Locale): "ltr" | "rtl" {
  return i18n.getDirection(locale);
}
