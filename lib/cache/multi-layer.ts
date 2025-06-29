// Multi-Layer Caching System
// Comprehensive caching strategy with memory, KV, and CDN layers

import { db } from "@/lib/db/connection.ts";
import type { UUID } from "@/types";

export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  version: string;
  tags: string[];
  compressed?: boolean;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
  memoryUsage: number;
  hitRate: number;
}

export interface CacheConfig {
  maxMemoryItems: number;
  defaultTTL: number;
  compressionThreshold: number;
  enableCompression: boolean;
  enableVersioning: boolean;
}

// Default cache configuration
const DEFAULT_CONFIG: CacheConfig = {
  maxMemoryItems: 1000,
  defaultTTL: 3600, // 1 hour
  compressionThreshold: 1024, // 1KB
  enableCompression: true,
  enableVersioning: true,
};

class MultiLayerCache {
  private static instance: MultiLayerCache;
  private memoryCache: Map<string, CacheEntry>;
  private metrics: CacheMetrics;
  private config: CacheConfig;
  private compressionCache: Map<string, string>;

  private constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.memoryCache = new Map();
    this.compressionCache = new Map();
    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      memoryUsage: 0,
      hitRate: 0,
    };

    // Start periodic cleanup
    this.startCleanupInterval();
  }

  static getInstance(config?: Partial<CacheConfig>): MultiLayerCache {
    if (!MultiLayerCache.instance) {
      MultiLayerCache.instance = new MultiLayerCache(config);
    }
    return MultiLayerCache.instance;
  }

  // 1. Memory Cache Layer (L1)
  private async getFromMemory<T>(key: string): Promise<T | null> {
    const entry = this.memoryCache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.timestamp + (entry.ttl * 1000)) {
      this.memoryCache.delete(key);
      this.metrics.evictions++;
      return null;
    }

    this.metrics.hits++;
    return entry.data as T;
  }

  private async setToMemory<T>(
    key: string,
    data: T,
    ttl?: number,
    tags: string[] = [],
  ): Promise<void> {
    // Check memory limit
    if (this.memoryCache.size >= this.config.maxMemoryItems) {
      this.evictOldestMemoryEntry();
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.config.defaultTTL,
      version: this.generateVersion(),
      tags,
      compressed: false,
    };

    // Compress large entries if enabled
    if (this.config.enableCompression) {
      const serializedData = JSON.stringify(data);
      if (serializedData.length > this.config.compressionThreshold) {
        entry.compressed = true;
        // In a real implementation, you'd use actual compression
        this.compressionCache.set(key, serializedData);
      }
    }

    this.memoryCache.set(key, entry);
    this.updateMemoryUsage();
  }

  // 2. KV Cache Layer (L2)
  private async getFromKV<T>(key: string): Promise<T | null> {
    try {
      const connection = db.getConnection();
      const kv = connection.kv as Deno.Kv;

      const result = await kv.get(["cache", key]);
      const entry = result.value as CacheEntry<T> | null;

      if (!entry) {
        return null;
      }

      // Check if expired
      if (Date.now() > entry.timestamp + (entry.ttl * 1000)) {
        await kv.delete(["cache", key]);
        return null;
      }

      // Move to memory cache for faster access
      await this.setToMemory(key, entry.data, entry.ttl, entry.tags);

      this.metrics.hits++;
      return entry.data;
    } catch (error) {
      console.error("KV cache get error:", error);
      return null;
    }
  }

  private async setToKV<T>(
    key: string,
    data: T,
    ttl?: number,
    tags: string[] = [],
  ): Promise<void> {
    try {
      const connection = db.getConnection();
      const kv = connection.kv as Deno.Kv;

      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        ttl: ttl || this.config.defaultTTL,
        version: this.generateVersion(),
        tags,
      };

      await kv.set(["cache", key], entry, {
        expireIn: (ttl || this.config.defaultTTL) * 1000,
      });
    } catch (error) {
      console.error("KV cache set error:", error);
    }
  }

  // 3. CDN Cache Layer (L3) - Headers and strategies
  private generateCDNHeaders(
    ttl: number,
    tags: string[] = [],
  ): Record<string, string> {
    const maxAge = ttl;
    const sMaxAge = Math.min(ttl, 3600); // CDN cache for max 1 hour

    return {
      "Cache-Control": `public, max-age=${maxAge}, s-maxage=${sMaxAge}`,
      "ETag": this.generateETag(tags),
      "Vary": "Accept-Encoding, Accept, Authorization",
      "X-Cache-Tags": tags.join(","),
    };
  }

  // Public API
  async get<T>(key: string): Promise<T | null> {
    // Try L1 (Memory) first
    let result = await this.getFromMemory<T>(key);
    if (result !== null) {
      return result;
    }

    // Try L2 (KV) second
    result = await this.getFromKV<T>(key);
    if (result !== null) {
      return result;
    }

    this.metrics.misses++;
    return null;
  }

  async set<T>(
    key: string,
    data: T,
    options: {
      ttl?: number;
      tags?: string[];
      layers?: ("memory" | "kv" | "cdn")[];
    } = {},
  ): Promise<void> {
    const { ttl, tags = [], layers = ["memory", "kv"] } = options;

    if (layers.includes("memory")) {
      await this.setToMemory(key, data, ttl, tags);
    }

    if (layers.includes("kv")) {
      await this.setToKV(key, data, ttl, tags);
    }

    // CDN caching is handled via response headers
  }

  async delete(key: string): Promise<void> {
    // Delete from memory
    this.memoryCache.delete(key);

    // Delete from KV
    try {
      const connection = db.getConnection();
      const kv = connection.kv as Deno.Kv;
      await kv.delete(["cache", key]);
    } catch (error) {
      console.error("KV cache delete error:", error);
    }
  }

  async invalidateByTags(tags: string[]): Promise<void> {
    // Invalidate memory cache entries with matching tags
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.tags.some((tag) => tags.includes(tag))) {
        this.memoryCache.delete(key);
      }
    }

    // Invalidate KV cache entries with matching tags
    try {
      const connection = db.getConnection();
      const kv = connection.kv as Deno.Kv;

      // This is a simplified approach - in production, you'd maintain a tag index
      const iterator = kv.list({ prefix: ["cache"] });

      for await (const entry of iterator) {
        const cacheEntry = entry.value as CacheEntry;
        if (cacheEntry?.tags.some((tag) => tags.includes(tag))) {
          await kv.delete(entry.key);
        }
      }
    } catch (error) {
      console.error("Tag invalidation error:", error);
    }
  }

  async clear(): Promise<void> {
    // Clear memory cache
    this.memoryCache.clear();

    // Clear KV cache
    try {
      const connection = db.getConnection();
      const kv = connection.kv as Deno.Kv;

      const iterator = kv.list({ prefix: ["cache"] });
      for await (const entry of iterator) {
        await kv.delete(entry.key);
      }
    } catch (error) {
      console.error("Cache clear error:", error);
    }

    this.resetMetrics();
  }

  // Cache warming
  async warmup(
    keys: Array<
      {
        key: string;
        fetcher: () => Promise<any>;
        ttl?: number;
        tags?: string[];
      }
    >,
  ): Promise<void> {
    console.log(`🔥 Warming up cache with ${keys.length} keys...`);

    const warmupPromises = keys.map(async ({ key, fetcher, ttl, tags }) => {
      try {
        const existingData = await this.get(key);
        if (existingData === null) {
          const data = await fetcher();
          await this.set(key, data, { ttl, tags });
          console.log(`✅ Warmed up cache for key: ${key}`);
        } else {
          console.log(`⚡ Cache already warm for key: ${key}`);
        }
      } catch (error) {
        console.error(`❌ Failed to warm up cache for key ${key}:`, error);
      }
    });

    await Promise.all(warmupPromises);
    console.log("🔥 Cache warmup completed");
  }

  // Utility methods
  private evictOldestMemoryEntry(): void {
    let oldestKey: string | null = null;
    let oldestTimestamp = Date.now();

    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.memoryCache.delete(oldestKey);
      this.metrics.evictions++;
    }
  }

  private updateMemoryUsage(): void {
    // Rough estimation of memory usage
    this.metrics.memoryUsage = this.memoryCache.size * 1024; // Approximate 1KB per entry
  }

  private generateVersion(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private generateETag(tags: string[]): string {
    return `"${Date.now().toString(36)}-${tags.join("-")}"`;
  }

  private startCleanupInterval(): void {
    setInterval(() => {
      this.cleanupExpiredEntries();
    }, 60000); // Clean up every minute
  }

  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.memoryCache.entries()) {
      if (now > entry.timestamp + (entry.ttl * 1000)) {
        this.memoryCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} expired cache entries`);
      this.updateMemoryUsage();
    }
  }

  private resetMetrics(): void {
    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      memoryUsage: 0,
      hitRate: 0,
    };
  }

  // Metrics and monitoring
  getMetrics(): CacheMetrics {
    const totalRequests = this.metrics.hits + this.metrics.misses;
    this.metrics.hitRate = totalRequests > 0
      ? (this.metrics.hits / totalRequests) * 100
      : 0;

    return { ...this.metrics };
  }

  getCacheInfo(): {
    memoryEntries: number;
    config: CacheConfig;
    metrics: CacheMetrics;
  } {
    return {
      memoryEntries: this.memoryCache.size,
      config: this.config,
      metrics: this.getMetrics(),
    };
  }

  // CDN integration helpers
  getCDNHeaders(ttl: number, tags: string[] = []): Record<string, string> {
    return this.generateCDNHeaders(ttl, tags);
  }

  validateCacheHeaders(request: Request): {
    ifNoneMatch?: string;
    ifModifiedSince?: string;
    cacheControl?: string;
  } {
    return {
      ifNoneMatch: request.headers.get("If-None-Match") || undefined,
      ifModifiedSince: request.headers.get("If-Modified-Since") || undefined,
      cacheControl: request.headers.get("Cache-Control") || undefined,
    };
  }
}

// Export singleton instance
export const cache = MultiLayerCache.getInstance();

// Cache key generators
export const CacheKeys = {
  content: (id: UUID) => `content:${id}`,
  contentList: (filters: Record<string, any>) =>
    `content:list:${JSON.stringify(filters)}`,
  media: (id: UUID) => `media:${id}`,
  mediaList: (filters: Record<string, any>) =>
    `media:list:${JSON.stringify(filters)}`,
  user: (id: UUID) => `user:${id}`,
  translation: (contentId: UUID, locale: string) =>
    `translation:${contentId}:${locale}`,
  analytics: (type: string, timeRange: string) =>
    `analytics:${type}:${timeRange}`,
  apiResponse: (endpoint: string, params: string) =>
    `api:${endpoint}:${params}`,
};

// Cache tags for invalidation
export const CacheTags = {
  CONTENT: "content",
  MEDIA: "media",
  USER: "user",
  TRANSLATION: "translation",
  ANALYTICS: "analytics",
  API: "api",
  SYSTEM: "system",
};
