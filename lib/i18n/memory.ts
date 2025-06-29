// Translation Memory System
// Stores and reuses previous translations for consistency and efficiency

import type {
  Locale,
  TranslationContext,
  TranslationMemoryEntry,
  UUID,
} from "@/types";
import { db } from "@/lib/db/mod.ts";
import { KeyPatterns } from "@/lib/db/patterns.ts";

export class TranslationMemoryManager {
  // Add translation to memory
  static async addToMemory(
    sourceText: string,
    targetText: string,
    sourceLocale: Locale,
    targetLocale: Locale,
    context?: TranslationContext,
    translatedBy?: UUID,
  ): Promise<TranslationMemoryEntry> {
    const memoryId = crypto.randomUUID();
    const now = Date.now();

    // Generate similarity hash for matching
    const sourceHash = this.generateTextHash(sourceText);

    const entry: TranslationMemoryEntry = {
      id: memoryId,
      sourceText,
      targetText,
      sourceLocale,
      targetLocale,
      sourceHash,
      context,
      translatedBy,
      createdAt: now,
      lastUsed: now,
      useCount: 1,
      quality: context?.quality || "unverified",
    };

    // Store in memory
    const connection = db.getConnection();
    const atomic = (connection.kv as Deno.Kv).atomic();

    atomic.set(KeyPatterns.translationMemory.byId(memoryId), entry);
    atomic.set(
      KeyPatterns.translationMemory.byHash(
        sourceHash,
        sourceLocale,
        targetLocale,
      ),
      memoryId,
    );
    atomic.set(
      KeyPatterns.translationMemory.byLocales(sourceLocale, targetLocale),
      memoryId,
    );

    await atomic.commit();
    return entry;
  }

  // Search translation memory for matches
  static async searchMemory(
    sourceText: string,
    sourceLocale: Locale,
    targetLocale: Locale,
    options?: {
      minSimilarity?: number;
      maxResults?: number;
      contextFilter?: string;
    },
  ): Promise<Array<TranslationMemoryEntry & { similarity: number }>> {
    const connection = db.getConnection();
    const results: Array<TranslationMemoryEntry & { similarity: number }> = [];
    const sourceHash = this.generateTextHash(sourceText);
    const minSimilarity = options?.minSimilarity || 0.7;
    const maxResults = options?.maxResults || 10;

    // First, try exact hash match
    const exactMatch = await (connection.kv as Deno.Kv).get<UUID>(
      KeyPatterns.translationMemory.byHash(
        sourceHash,
        sourceLocale,
        targetLocale,
      ),
    );

    if (exactMatch.value) {
      const entry = await this.getMemoryEntry(exactMatch.value);
      if (entry) {
        results.push({ ...entry, similarity: 1.0 });
        // Update usage statistics
        await this.updateUsageStats(entry.id);
      }
    }

    // If no exact match or we need more results, search by locale
    if (results.length === 0 || results.length < maxResults) {
      const iterator = (connection.kv as Deno.Kv).list<UUID>({
        prefix: KeyPatterns.translationMemory.byLocales(
          sourceLocale,
          targetLocale,
        ),
      });

      for await (const { value } of iterator) {
        if (value && results.length < maxResults) {
          const entry = await this.getMemoryEntry(value);
          if (entry && entry.id !== exactMatch.value) {
            const similarity = this.calculateSimilarity(
              sourceText,
              entry.sourceText,
            );

            if (similarity >= minSimilarity) {
              results.push({ ...entry, similarity });
            }
          }
        }
      }
    }

    // Sort by similarity (highest first) and quality
    return results.sort((a, b) => {
      if (Math.abs(a.similarity - b.similarity) < 0.01) {
        // If similarity is very close, prefer higher quality
        const qualityOrder = { verified: 3, reviewed: 2, unverified: 1 };
        return (qualityOrder[b.quality] || 0) - (qualityOrder[a.quality] || 0);
      }
      return b.similarity - a.similarity;
    });
  }

  // Get memory entry by ID
  static async getMemoryEntry(
    entryId: UUID,
  ): Promise<TranslationMemoryEntry | null> {
    const connection = db.getConnection();
    const result = await (connection.kv as Deno.Kv).get<TranslationMemoryEntry>(
      KeyPatterns.translationMemory.byId(entryId),
    );
    return result.value || null;
  }

  // Update usage statistics
  static async updateUsageStats(entryId: UUID): Promise<void> {
    const entry = await this.getMemoryEntry(entryId);
    if (!entry) {
      return;
    }

    const updatedEntry: TranslationMemoryEntry = {
      ...entry,
      useCount: entry.useCount + 1,
      lastUsed: Date.now(),
    };

    const connection = db.getConnection();
    await (connection.kv as Deno.Kv).set(
      KeyPatterns.translationMemory.byId(entryId),
      updatedEntry,
    );
  }

  // Get memory statistics
  static async getMemoryStats(): Promise<{
    totalEntries: number;
    byLocale: Record<string, number>;
    byQuality: Record<"verified" | "reviewed" | "unverified", number>;
    totalMatches: number;
    averageUseCount: number;
  }> {
    const connection = db.getConnection();
    let totalEntries = 0;
    let totalMatches = 0;
    let totalUseCount = 0;
    const byLocale: Record<string, number> = {};
    const byQuality = { verified: 0, reviewed: 0, unverified: 0 };

    const iterator = (connection.kv as Deno.Kv).list<TranslationMemoryEntry>({
      prefix: KeyPatterns.translationMemory.all(),
    });

    for await (const { value } of iterator) {
      if (value) {
        totalEntries++;
        totalUseCount += value.useCount;
        totalMatches += value.useCount - 1; // Subtract initial creation

        const localePair = `${value.sourceLocale}-${value.targetLocale}`;
        byLocale[localePair] = (byLocale[localePair] || 0) + 1;
        byQuality[value.quality]++;
      }
    }

    return {
      totalEntries,
      byLocale,
      byQuality,
      totalMatches,
      averageUseCount: totalEntries > 0
        ? Math.round((totalUseCount / totalEntries) * 100) / 100
        : 0,
    };
  }

  // Generate hash for text similarity matching
  private static generateTextHash(text: string): string {
    // Simple hash function for text similarity
    const normalized = text.toLowerCase().trim().replace(/\s+/g, " ");
    let hash = 0;

    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return hash.toString(36);
  }

  // Calculate text similarity (simple Levenshtein distance)
  private static calculateSimilarity(text1: string, text2: string): number {
    const a = text1.toLowerCase();
    const b = text2.toLowerCase();

    if (a === b) return 1.0;

    const matrix: number[][] = [];

    // Initialize matrix
    for (let i = 0; i <= a.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= b.length; j++) {
      matrix[0][j] = j;
    }

    // Calculate distances
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        if (a[i - 1] === b[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1, // deletion
          );
        }
      }
    }

    const maxLength = Math.max(a.length, b.length);
    const distance = matrix[a.length][b.length];

    return maxLength === 0 ? 1.0 : (maxLength - distance) / maxLength;
  }
}

export default TranslationMemoryManager;
