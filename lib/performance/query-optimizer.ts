// Database Query Optimizer
// Intelligent query optimization and caching for better performance

import { db } from "@/lib/db/connection.ts";
import { cache } from "@/lib/cache/multi-layer.ts";
import { performanceMonitor } from "@/lib/performance/monitoring.ts";

export interface QueryPlan {
  query: string;
  estimatedTime: number;
  cacheKey?: string;
  indexSuggestions: string[];
  optimizations: string[];
}

export interface QueryMetrics {
  query: string;
  executionTime: number;
  resultCount: number;
  cacheHit: boolean;
  timestamp: number;
}

class QueryOptimizer {
  private static instance: QueryOptimizer;
  private queryCache: Map<string, any>;
  private queryMetrics: QueryMetrics[];
  private slowQueries: Map<string, QueryMetrics[]>;

  private constructor() {
    this.queryCache = new Map();
    this.queryMetrics = [];
    this.slowQueries = new Map();
  }

  static getInstance(): QueryOptimizer {
    if (!QueryOptimizer.instance) {
      QueryOptimizer.instance = new QueryOptimizer();
    }
    return QueryOptimizer.instance;
  }

  // Optimize and execute query
  async executeOptimizedQuery<T>(
    keyPattern: string[],
    options: {
      useCache?: boolean;
      cacheTTL?: number;
      cachePrefix?: string;
    } = {},
  ): Promise<T | null> {
    const startTime = Date.now();
    const queryString = keyPattern.join(":");
    const cacheKey = options.cachePrefix
      ? `${options.cachePrefix}:${queryString}`
      : queryString;

    // Try cache first if enabled
    if (options.useCache !== false) {
      const cachedResult = await cache.get<T>(cacheKey);
      if (cachedResult !== null) {
        this.recordMetrics(queryString, Date.now() - startTime, 1, true);
        return cachedResult;
      }
    }

    try {
      const connection = db.getConnection();
      const kv = connection.kv as Deno.Kv;

      // Execute query
      const result = await kv.get(keyPattern);
      const executionTime = Date.now() - startTime;

      // Cache result if specified
      if (options.useCache !== false && result.value) {
        await cache.set(cacheKey, result.value, {
          ttl: options.cacheTTL || 300, // 5 minutes default
          tags: [this.extractEntityFromKey(keyPattern[0])],
        });
      }

      this.recordMetrics(
        queryString,
        executionTime,
        result.value ? 1 : 0,
        false,
      );
      return result.value as T;
    } catch (error) {
      console.error("Query execution error:", error);
      this.recordMetrics(queryString, Date.now() - startTime, 0, false);
      return null;
    }
  }

  // Execute bulk queries with optimization
  async executeBulkQuery<T>(
    keyPatterns: string[][],
    options: {
      useCache?: boolean;
      cacheTTL?: number;
      batchSize?: number;
    } = {},
  ): Promise<Array<T | null>> {
    const { batchSize = 10 } = options;
    const results: Array<T | null> = [];

    // Process in batches to avoid overwhelming the system
    for (let i = 0; i < keyPatterns.length; i += batchSize) {
      const batch = keyPatterns.slice(i, i + batchSize);
      const batchPromises = batch.map((keyPattern) =>
        this.executeOptimizedQuery<T>(keyPattern, options)
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }

  // List queries with optimization
  async executeListQuery<T>(
    prefix: string[],
    options: {
      limit?: number;
      reverse?: boolean;
      useCache?: boolean;
      cacheTTL?: number;
      filterFn?: (item: T) => boolean;
    } = {},
  ): Promise<T[]> {
    const startTime = Date.now();
    const queryString = `list:${prefix.join(":")}`;
    const cacheKey = `list:${prefix.join(":")}:${JSON.stringify(options)}`;

    // Try cache first
    if (options.useCache !== false) {
      const cachedResult = await cache.get<T[]>(cacheKey);
      if (cachedResult !== null) {
        this.recordMetrics(
          queryString,
          Date.now() - startTime,
          cachedResult.length,
          true,
        );
        return cachedResult;
      }
    }

    try {
      const connection = db.getConnection();
      const kv = connection.kv as Deno.Kv;

      const results: T[] = [];
      const iterator = kv.list({
        prefix,
        limit: options.limit,
        reverse: options.reverse,
      });

      for await (const entry of iterator) {
        const value = entry.value as T;
        if (!options.filterFn || options.filterFn(value)) {
          results.push(value);
        }
      }

      const executionTime = Date.now() - startTime;

      // Cache results
      if (options.useCache !== false) {
        await cache.set(cacheKey, results, {
          ttl: options.cacheTTL || 300,
          tags: [this.extractEntityFromKey(prefix[0])],
        });
      }

      this.recordMetrics(queryString, executionTime, results.length, false);
      return results;
    } catch (error) {
      console.error("List query execution error:", error);
      this.recordMetrics(queryString, Date.now() - startTime, 0, false);
      return [];
    }
  }

  // Search optimization
  async executeSearchQuery<T>(
    searchParams: {
      type: string;
      filters: Record<string, any>;
      sortBy?: string;
      sortOrder?: "asc" | "desc";
      limit?: number;
      offset?: number;
    },
    options: {
      useCache?: boolean;
      cacheTTL?: number;
    } = {},
  ): Promise<{ results: T[]; total: number; hasMore: boolean }> {
    const startTime = Date.now();
    const queryString = `search:${searchParams.type}:${
      JSON.stringify(searchParams)
    }`;
    const cacheKey = `search:${JSON.stringify(searchParams)}`;

    // Try cache first
    if (options.useCache !== false) {
      const cachedResult = await cache.get<
        { results: T[]; total: number; hasMore: boolean }
      >(cacheKey);
      if (cachedResult !== null) {
        this.recordMetrics(
          queryString,
          Date.now() - startTime,
          cachedResult.results.length,
          true,
        );
        return cachedResult;
      }
    }

    try {
      // This is a simplified search implementation
      // In production, you'd use more sophisticated indexing
      const allResults = await this.executeListQuery<T>(
        [searchParams.type],
        { useCache: false },
      );

      // Apply filters
      let filteredResults = allResults.filter((item) => {
        return Object.entries(searchParams.filters).every(([key, value]) => {
          const itemValue = (item as any)[key];
          if (typeof value === "string" && typeof itemValue === "string") {
            return itemValue.toLowerCase().includes(value.toLowerCase());
          }
          return itemValue === value;
        });
      });

      // Apply sorting
      if (searchParams.sortBy) {
        filteredResults.sort((a, b) => {
          const aValue = (a as any)[searchParams.sortBy!];
          const bValue = (b as any)[searchParams.sortBy!];

          if (searchParams.sortOrder === "desc") {
            return bValue > aValue ? 1 : -1;
          }
          return aValue > bValue ? 1 : -1;
        });
      }

      // Apply pagination
      const total = filteredResults.length;
      const offset = searchParams.offset || 0;
      const limit = searchParams.limit || 20;
      const results = filteredResults.slice(offset, offset + limit);
      const hasMore = offset + limit < total;

      const searchResult = { results, total, hasMore };
      const executionTime = Date.now() - startTime;

      // Cache results
      if (options.useCache !== false) {
        await cache.set(cacheKey, searchResult, {
          ttl: options.cacheTTL || 300,
          tags: [searchParams.type],
        });
      }

      this.recordMetrics(queryString, executionTime, results.length, false);
      return searchResult;
    } catch (error) {
      console.error("Search query execution error:", error);
      this.recordMetrics(queryString, Date.now() - startTime, 0, false);
      return { results: [], total: 0, hasMore: false };
    }
  }

  // Query plan analysis
  analyzeQuery(query: string): QueryPlan {
    const estimatedTime = this.estimateQueryTime(query);
    const indexSuggestions = this.suggestIndexes(query);
    const optimizations = this.suggestOptimizations(query);

    return {
      query,
      estimatedTime,
      cacheKey: this.generateCacheKey(query),
      indexSuggestions,
      optimizations,
    };
  }

  // Performance analytics
  getQueryAnalytics(): {
    totalQueries: number;
    averageExecutionTime: number;
    cacheHitRate: number;
    slowQueries: Array<{ query: string; avgTime: number; count: number }>;
    topQueries: Array<{ query: string; count: number }>;
  } {
    const totalQueries = this.queryMetrics.length;
    const totalTime = this.queryMetrics.reduce(
      (sum, m) => sum + m.executionTime,
      0,
    );
    const cacheHits = this.queryMetrics.filter((m) => m.cacheHit).length;

    const averageExecutionTime = totalQueries > 0
      ? totalTime / totalQueries
      : 0;
    const cacheHitRate = totalQueries > 0
      ? (cacheHits / totalQueries) * 100
      : 0;

    // Analyze slow queries
    const queryStats = new Map<string, { totalTime: number; count: number }>();
    this.queryMetrics.forEach((metric) => {
      const existing = queryStats.get(metric.query) ||
        { totalTime: 0, count: 0 };
      existing.totalTime += metric.executionTime;
      existing.count += 1;
      queryStats.set(metric.query, existing);
    });

    const slowQueries = Array.from(queryStats.entries())
      .map(([query, stats]) => ({
        query,
        avgTime: stats.totalTime / stats.count,
        count: stats.count,
      }))
      .filter((q) => q.avgTime > 100) // Queries taking more than 100ms
      .sort((a, b) => b.avgTime - a.avgTime)
      .slice(0, 10);

    const topQueries = Array.from(queryStats.entries())
      .map(([query, stats]) => ({
        query,
        count: stats.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalQueries,
      averageExecutionTime,
      cacheHitRate,
      slowQueries,
      topQueries,
    };
  }

  // Cache management
  async invalidateQueryCache(patterns: string[]): Promise<void> {
    const tags = patterns.map((pattern) => this.extractEntityFromKey(pattern));
    await cache.invalidateByTags(tags);
  }

  // Private helper methods
  private recordMetrics(
    query: string,
    executionTime: number,
    resultCount: number,
    cacheHit: boolean,
  ): void {
    const metric: QueryMetrics = {
      query,
      executionTime,
      resultCount,
      cacheHit,
      timestamp: Date.now(),
    };

    this.queryMetrics.push(metric);

    // Keep only last 1000 metrics
    if (this.queryMetrics.length > 1000) {
      this.queryMetrics.shift();
    }

    // Track slow queries (>500ms)
    if (executionTime > 500) {
      if (!this.slowQueries.has(query)) {
        this.slowQueries.set(query, []);
      }
      this.slowQueries.get(query)!.push(metric);
    }

    // Report to performance monitor
    performanceMonitor.trackResponseTime(`db:${query}`, executionTime);
  }

  private estimateQueryTime(query: string): number {
    // Simple estimation based on query complexity
    const baseTime = 10; // 10ms base
    let complexity = 1;

    if (query.includes("list:")) complexity += 2;
    if (query.includes("search:")) complexity += 3;
    if (query.includes("bulk:")) complexity += 4;

    return baseTime * complexity;
  }

  private suggestIndexes(query: string): string[] {
    const suggestions: string[] = [];

    if (query.includes("search:")) {
      suggestions.push("Consider adding full-text search indexes");
      suggestions.push("Index frequently filtered fields");
    }

    if (query.includes("list:")) {
      suggestions.push("Consider compound indexes for list queries");
    }

    return suggestions;
  }

  private suggestOptimizations(query: string): string[] {
    const optimizations: string[] = [];

    optimizations.push("Enable query result caching");
    optimizations.push("Consider pagination for large result sets");

    if (query.includes("search:")) {
      optimizations.push("Implement search result caching");
      optimizations.push("Consider using dedicated search indexes");
    }

    return optimizations;
  }

  private generateCacheKey(query: string): string {
    return `query:${query.replace(/[^a-zA-Z0-9]/g, "_")}`;
  }

  private extractEntityFromKey(key: string): string {
    // Extract entity type from key for tagging
    if (key.includes("content")) return "content";
    if (key.includes("media")) return "media";
    if (key.includes("user")) return "user";
    return "general";
  }
}

// Export singleton instance
export const queryOptimizer = QueryOptimizer.getInstance();

// Helper functions for common query patterns
export const QueryHelpers = {
  // Content queries
  async getContent(id: string): Promise<any> {
    return queryOptimizer.executeOptimizedQuery(["content", id], {
      useCache: true,
      cacheTTL: 600, // 10 minutes
      cachePrefix: "content",
    });
  },

  async listContent(filters: Record<string, any> = {}): Promise<any[]> {
    const searchResult = await queryOptimizer.executeSearchQuery({
      type: "content",
      filters,
      limit: 20,
    }, {
      useCache: true,
      cacheTTL: 300, // 5 minutes
    });
    return searchResult.results;
  },

  // Media queries
  async getMedia(id: string): Promise<any> {
    return queryOptimizer.executeOptimizedQuery(["media", id], {
      useCache: true,
      cacheTTL: 1800, // 30 minutes (media changes less frequently)
      cachePrefix: "media",
    });
  },

  async listMedia(filters: Record<string, any> = {}): Promise<any[]> {
    const searchResult = await queryOptimizer.executeSearchQuery({
      type: "media",
      filters,
      limit: 20,
    }, {
      useCache: true,
      cacheTTL: 600, // 10 minutes
    });
    return searchResult.results;
  },

  // User queries
  async getUser(id: string): Promise<any> {
    return queryOptimizer.executeOptimizedQuery(["user", id], {
      useCache: true,
      cacheTTL: 300, // 5 minutes
      cachePrefix: "user",
    });
  },
};
