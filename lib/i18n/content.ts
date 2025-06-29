// Content Localization System
// Multilingual content management with translation workflows

import type {
  Content,
  ContentTranslation,
  Locale,
  TranslationMemoryEntry,
  TranslationStatus,
  TranslationWorkflow,
  UUID,
} from "@/types";
import { db } from "@/lib/db/mod.ts";
import { KeyPatterns } from "@/lib/db/patterns.ts";
import { i18n } from "./core.ts";

export class ContentLocalizationManager {
  // Create content with initial locale
  static async createLocalizedContent(
    contentData: Omit<
      Content,
      "id" | "createdAt" | "updatedAt" | "translations"
    >,
    locale: Locale,
    authorId: UUID,
  ): Promise<Content> {
    const contentId = crypto.randomUUID();
    const now = Date.now();

    const content: Content = {
      ...contentData,
      id: contentId,
      createdAt: now,
      updatedAt: now,
      createdBy: authorId,
      updatedBy: authorId,
      defaultLocale: locale,
      translations: {
        [locale]: {
          id: crypto.randomUUID(),
          contentId,
          locale,
          title: contentData.title,
          content: contentData.content,
          fields: contentData.fields || {},
          status: "published" as TranslationStatus,
          translatedBy: authorId,
          createdAt: now,
          updatedAt: now,
        },
      },
    };

    // Store content
    const connection = db.getConnection();
    const atomic = (connection.kv as Deno.Kv).atomic();

    atomic.set(KeyPatterns.content.byId(contentId), content);
    atomic.set(KeyPatterns.content.byLocale(locale), contentId);

    if (content.slug) {
      atomic.set(KeyPatterns.content.bySlug(content.slug, locale), contentId);
    }

    await atomic.commit();
    return content;
  }

  // Add translation to existing content
  static async addTranslation(
    contentId: UUID,
    locale: Locale,
    translationData: {
      title: string;
      content: string;
      fields?: Record<string, unknown>;
      translatedBy: UUID;
      status?: TranslationStatus;
    },
  ): Promise<ContentTranslation> {
    const content = await this.getContent(contentId);
    if (!content) {
      throw new Error("Content not found");
    }

    if (content.translations[locale]) {
      throw new Error(`Translation for locale ${locale} already exists`);
    }

    const now = Date.now();
    const translation: ContentTranslation = {
      id: crypto.randomUUID(),
      contentId,
      locale,
      title: translationData.title,
      content: translationData.content,
      fields: translationData.fields || {},
      status: translationData.status || "draft",
      translatedBy: translationData.translatedBy,
      createdAt: now,
      updatedAt: now,
    };

    // Update content with new translation
    const updatedContent = {
      ...content,
      translations: {
        ...content.translations,
        [locale]: translation,
      },
      updatedAt: now,
      updatedBy: translationData.translatedBy,
    };

    // Store updated content
    const connection = db.getConnection();
    const atomic = (connection.kv as Deno.Kv).atomic();

    atomic.set(KeyPatterns.content.byId(contentId), updatedContent);
    atomic.set(KeyPatterns.content.byLocale(locale), contentId);

    // Update slug index if content has slug
    if (content.slug) {
      atomic.set(KeyPatterns.content.bySlug(content.slug, locale), contentId);
    }

    await atomic.commit();
    return translation;
  }

  // Update existing translation
  static async updateTranslation(
    contentId: UUID,
    locale: Locale,
    updates: Partial<{
      title: string;
      content: string;
      fields: Record<string, unknown>;
      status: TranslationStatus;
      translatedBy: UUID;
      reviewedBy: UUID;
      approvedBy: UUID;
    }>,
  ): Promise<ContentTranslation | null> {
    const content = await this.getContent(contentId);
    if (!content || !content.translations[locale]) {
      return null;
    }

    const now = Date.now();
    const existingTranslation = content.translations[locale];

    const updatedTranslation: ContentTranslation = {
      ...existingTranslation,
      ...updates,
      updatedAt: now,
    };

    // Handle status changes
    if (updates.status) {
      switch (updates.status) {
        case "review":
          updatedTranslation.submittedForReviewAt = now;
          break;
        case "approved":
          updatedTranslation.approvedAt = now;
          if (updates.approvedBy) {
            updatedTranslation.approvedBy = updates.approvedBy;
          }
          break;
        case "published":
          updatedTranslation.publishedAt = now;
          break;
        case "rejected":
          updatedTranslation.rejectedAt = now;
          break;
      }
    }

    // Update content
    const updatedContent = {
      ...content,
      translations: {
        ...content.translations,
        [locale]: updatedTranslation,
      },
      updatedAt: now,
    };

    // Store updated content
    const connection = db.getConnection();
    await (connection.kv as Deno.Kv).set(
      KeyPatterns.content.byId(contentId),
      updatedContent,
    );

    return updatedTranslation;
  }

  // Get content with all translations
  static async getContent(contentId: UUID): Promise<Content | null> {
    const connection = db.getConnection();
    const result = await (connection.kv as Deno.Kv).get<Content>(
      KeyPatterns.content.byId(contentId),
    );
    return result.value || null;
  }

  // Get content by slug and locale
  static async getContentBySlug(
    slug: string,
    locale: Locale,
  ): Promise<Content | null> {
    const connection = db.getConnection();
    const result = await (connection.kv as Deno.Kv).get<UUID>(
      KeyPatterns.content.bySlug(slug, locale),
    );

    if (!result.value) {
      return null;
    }

    return await this.getContent(result.value);
  }

  // Get content translation for specific locale
  static async getTranslation(
    contentId: UUID,
    locale: Locale,
    fallbackToDefault = true,
  ): Promise<ContentTranslation | null> {
    const content = await this.getContent(contentId);
    if (!content) {
      return null;
    }

    // Try requested locale first
    if (content.translations[locale]) {
      return content.translations[locale];
    }

    // Fallback to default locale if requested
    if (
      fallbackToDefault && content.defaultLocale &&
      content.translations[content.defaultLocale]
    ) {
      return content.translations[content.defaultLocale];
    }

    return null;
  }

  // List content by locale
  static async getContentByLocale(
    locale: Locale,
    options?: {
      status?: TranslationStatus;
      limit?: number;
      offset?: number;
    },
  ): Promise<Content[]> {
    const connection = db.getConnection();
    const content: Content[] = [];

    // Get all content IDs for locale
    const iterator = (connection.kv as Deno.Kv).list<UUID>({
      prefix: KeyPatterns.content.byLocale(locale),
    });

    let processed = 0;
    for await (const { value } of iterator) {
      if (value) {
        // Apply offset
        if (options?.offset && processed < options.offset) {
          processed++;
          continue;
        }

        const contentItem = await this.getContent(value);
        if (contentItem) {
          // Filter by status if specified
          if (options?.status) {
            const translation = contentItem.translations[locale];
            if (!translation || translation.status !== options.status) {
              continue;
            }
          }

          content.push(contentItem);

          // Apply limit
          if (options?.limit && content.length >= options.limit) {
            break;
          }
        }
      }
      processed++;
    }

    return content;
  }

  // Get available locales for content
  static getAvailableLocales(content: Content): Locale[] {
    return Object.keys(content.translations) as Locale[];
  }

  // Check if content has translation for locale
  static hasTranslation(content: Content, locale: Locale): boolean {
    return locale in content.translations;
  }

  // Get translation completion status
  static getTranslationProgress(content: Content): {
    total: number;
    completed: number;
    inProgress: number;
    missing: number;
    byLocale: Record<Locale, TranslationStatus | "missing">;
  } {
    const availableLocales = i18n.getAvailableLocales();
    const contentLocales = this.getAvailableLocales(content);

    let completed = 0;
    let inProgress = 0;
    let missing = 0;
    const byLocale: Record<Locale, TranslationStatus | "missing"> =
      {} as Record<Locale, TranslationStatus | "missing">;

    for (const localeConfig of availableLocales) {
      const locale = localeConfig.code as Locale;
      const translation = content.translations[locale];

      if (!translation) {
        missing++;
        byLocale[locale] = "missing";
      } else {
        byLocale[locale] = translation.status;

        if (translation.status === "published") {
          completed++;
        } else {
          inProgress++;
        }
      }
    }

    return {
      total: availableLocales.length,
      completed,
      inProgress,
      missing,
      byLocale,
    };
  }

  // Clone content for translation
  static async cloneForTranslation(
    contentId: UUID,
    sourceLocale: Locale,
    targetLocale: Locale,
    translatorId: UUID,
  ): Promise<ContentTranslation | null> {
    const content = await this.getContent(contentId);
    if (!content || !content.translations[sourceLocale]) {
      return null;
    }

    if (content.translations[targetLocale]) {
      throw new Error(`Translation for ${targetLocale} already exists`);
    }

    const sourceTranslation = content.translations[sourceLocale];

    // Create new translation based on source
    const newTranslation = await this.addTranslation(contentId, targetLocale, {
      title: sourceTranslation.title,
      content: sourceTranslation.content,
      fields: sourceTranslation.fields,
      translatedBy: translatorId,
      status: "draft",
    });

    return newTranslation;
  }

  // Get translation statistics
  static async getTranslationStats(): Promise<{
    totalContent: number;
    totalTranslations: number;
    byStatus: Record<TranslationStatus, number>;
    byLocale: Record<Locale, number>;
    completionRate: number;
  }> {
    const connection = db.getConnection();
    let totalContent = 0;
    let totalTranslations = 0;
    const byStatus: Record<TranslationStatus, number> = {
      draft: 0,
      review: 0,
      approved: 0,
      published: 0,
      rejected: 0,
    };
    const byLocale: Record<Locale, number> = {} as Record<Locale, number>;

    // Iterate through all content
    const iterator = (connection.kv as Deno.Kv).list<Content>({
      prefix: KeyPatterns.content.all(),
    });

    for await (const { value } of iterator) {
      if (value) {
        totalContent++;

        for (
          const [locale, translation] of Object.entries(value.translations)
        ) {
          totalTranslations++;
          byStatus[translation.status]++;
          byLocale[locale as Locale] = (byLocale[locale as Locale] || 0) + 1;
        }
      }
    }

    const availableLocales = i18n.getAvailableLocales();
    const expectedTranslations = totalContent * availableLocales.length;
    const completionRate = expectedTranslations > 0
      ? (totalTranslations / expectedTranslations) * 100
      : 0;

    return {
      totalContent,
      totalTranslations,
      byStatus,
      byLocale,
      completionRate: Math.round(completionRate * 100) / 100,
    };
  }

  // Search localized content
  static async searchContent(
    query: string,
    locale: Locale,
    options?: {
      limit?: number;
      contentType?: string;
      status?: TranslationStatus;
    },
  ): Promise<Content[]> {
    const allContent = await this.getContentByLocale(locale, {
      status: options?.status,
      limit: options?.limit ? options.limit * 2 : 100, // Get more to filter
    });

    const lowerQuery = query.toLowerCase();

    return allContent
      .filter((content) => {
        const translation = content.translations[locale];
        if (!translation) return false;

        // Filter by content type if specified
        if (
          options?.contentType && content.contentType !== options.contentType
        ) {
          return false;
        }

        // Search in title and content
        return (
          translation.title.toLowerCase().includes(lowerQuery) ||
          translation.content.toLowerCase().includes(lowerQuery)
        );
      })
      .slice(0, options?.limit || 20);
  }
}

// Export content localization manager
export { ContentLocalizationManager as default };
