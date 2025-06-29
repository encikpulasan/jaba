// API Analytics System
// Comprehensive analytics for REST and GraphQL API usage

import { db } from "@/lib/db/connection.ts";
import type { UUID } from "@/types";

export interface APIRequestLog {
  id: UUID;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime?: number;
  userAgent: string;
  ipAddress: string;
  userId?: UUID;
  apiKeyId?: UUID;
  timestamp: number;
  requestSize?: number;
  responseSize?: number;
  graphqlOperation?: string;
  graphqlQuery?: string;
  errors?: string[];
}

export interface APIAnalytics {
  timeRange: {
    start: number;
    end: number;
  };
  totalRequests: number;
  successfulRequests: number;
  errorRequests: number;
  averageResponseTime: number;
  topEndpoints: Array<{
    endpoint: string;
    count: number;
    averageResponseTime: number;
  }>;
  statusCodeBreakdown: Record<number, number>;
  userBreakdown: Array<{
    userId?: UUID;
    apiKeyId?: UUID;
    requestCount: number;
  }>;
  graphqlOperations?: Array<{
    operation: string;
    count: number;
    averageResponseTime: number;
  }>;
}

class APIAnalyticsManager {
  private static instance: APIAnalyticsManager;

  private constructor() {}

  static getInstance(): APIAnalyticsManager {
    if (!APIAnalyticsManager.instance) {
      APIAnalyticsManager.instance = new APIAnalyticsManager();
    }
    return APIAnalyticsManager.instance;
  }

  // Track a single API request
  async trackRequest(log: APIRequestLog): Promise<void> {
    try {
      const connection = db.getConnection();
      const kv = connection.kv as Deno.Kv;

      // Generate unique ID if not provided
      if (!log.id) {
        log.id = crypto.randomUUID() as UUID;
      }

      // Store individual request log
      const requestKey = ["api_logs", "requests", log.id];
      await kv.set(requestKey, log, {
        expireIn: 30 * 24 * 60 * 60 * 1000, // Keep for 30 days
      });

      // Update aggregated statistics
      await this.updateAggregatedStats(log);

      // Update real-time metrics
      await this.updateRealTimeMetrics(log);
    } catch (error) {
      console.error("Error tracking API request:", error);
      // Don't throw error to avoid breaking the actual API request
    }
  }

  // Update aggregated statistics
  private async updateAggregatedStats(log: APIRequestLog): Promise<void> {
    const connection = db.getConnection();
    const kv = connection.kv as Deno.Kv;

    const now = new Date();
    const hourKey =
      `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
    const dayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;

    try {
      // Update hourly stats
      const hourlyStatsKey = ["api_analytics", "hourly", hourKey];
      const hourlyStats = await kv.get(hourlyStatsKey);
      const currentHourlyStats = hourlyStats.value as any || {
        totalRequests: 0,
        successfulRequests: 0,
        errorRequests: 0,
        totalResponseTime: 0,
        endpoints: {},
        statusCodes: {},
      };

      currentHourlyStats.totalRequests++;
      if (log.statusCode >= 200 && log.statusCode < 400) {
        currentHourlyStats.successfulRequests++;
      } else {
        currentHourlyStats.errorRequests++;
      }

      if (log.responseTime) {
        currentHourlyStats.totalResponseTime += log.responseTime;
      }

      // Track endpoint usage
      if (!currentHourlyStats.endpoints[log.endpoint]) {
        currentHourlyStats.endpoints[log.endpoint] = {
          count: 0,
          totalResponseTime: 0,
        };
      }
      currentHourlyStats.endpoints[log.endpoint].count++;
      if (log.responseTime) {
        currentHourlyStats.endpoints[log.endpoint].totalResponseTime +=
          log.responseTime;
      }

      // Track status codes
      if (!currentHourlyStats.statusCodes[log.statusCode]) {
        currentHourlyStats.statusCodes[log.statusCode] = 0;
      }
      currentHourlyStats.statusCodes[log.statusCode]++;

      await kv.set(hourlyStatsKey, currentHourlyStats, {
        expireIn: 7 * 24 * 60 * 60 * 1000, // Keep for 7 days
      });

      // Update daily stats (similar structure)
      const dailyStatsKey = ["api_analytics", "daily", dayKey];
      const dailyStats = await kv.get(dailyStatsKey);
      const currentDailyStats = dailyStats.value as any || {
        totalRequests: 0,
        successfulRequests: 0,
        errorRequests: 0,
        totalResponseTime: 0,
        endpoints: {},
        statusCodes: {},
        users: {},
      };

      currentDailyStats.totalRequests++;
      if (log.statusCode >= 200 && log.statusCode < 400) {
        currentDailyStats.successfulRequests++;
      } else {
        currentDailyStats.errorRequests++;
      }

      if (log.responseTime) {
        currentDailyStats.totalResponseTime += log.responseTime;
      }

      // Track user usage
      const userKey = log.userId || log.apiKeyId || "anonymous";
      if (!currentDailyStats.users[userKey]) {
        currentDailyStats.users[userKey] = 0;
      }
      currentDailyStats.users[userKey]++;

      await kv.set(dailyStatsKey, currentDailyStats, {
        expireIn: 90 * 24 * 60 * 60 * 1000, // Keep for 90 days
      });
    } catch (error) {
      console.error("Error updating aggregated stats:", error);
    }
  }

  // Update real-time metrics
  private async updateRealTimeMetrics(log: APIRequestLog): Promise<void> {
    const connection = db.getConnection();
    const kv = connection.kv as Deno.Kv;

    try {
      // Update 5-minute rolling metrics
      const fiveMinuteWindow = Math.floor(Date.now() / (5 * 60 * 1000));
      const realtimeKey = [
        "api_analytics",
        "realtime",
        fiveMinuteWindow.toString(),
      ];

      const realtimeStats = await kv.get(realtimeKey);
      const currentRealtimeStats = realtimeStats.value as any || {
        requests: 0,
        errors: 0,
        totalResponseTime: 0,
        timestamp: Date.now(),
      };

      currentRealtimeStats.requests++;
      if (log.statusCode >= 400) {
        currentRealtimeStats.errors++;
      }
      if (log.responseTime) {
        currentRealtimeStats.totalResponseTime += log.responseTime;
      }

      await kv.set(realtimeKey, currentRealtimeStats, {
        expireIn: 60 * 60 * 1000, // Keep for 1 hour
      });
    } catch (error) {
      console.error("Error updating real-time metrics:", error);
    }
  }

  // Get analytics for a time range
  async getAnalytics(
    startTime: number,
    endTime: number,
    granularity: "hour" | "day" = "hour",
  ): Promise<APIAnalytics> {
    const connection = db.getConnection();
    const kv = connection.kv as Deno.Kv;

    try {
      const analytics: APIAnalytics = {
        timeRange: { start: startTime, end: endTime },
        totalRequests: 0,
        successfulRequests: 0,
        errorRequests: 0,
        averageResponseTime: 0,
        topEndpoints: [],
        statusCodeBreakdown: {},
        userBreakdown: [],
      };

      // Generate time keys for the range
      const timeKeys = this.generateTimeKeys(startTime, endTime, granularity);

      let totalResponseTime = 0;
      const endpointStats: Record<
        string,
        { count: number; totalTime: number }
      > = {};
      const userStats: Record<string, number> = {};

      // Aggregate data from all time periods
      for (const timeKey of timeKeys) {
        const statsKey = [
          "api_analytics",
          granularity === "hour" ? "hourly" : "daily",
          timeKey,
        ];
        const stats = await kv.get(statsKey);

        if (stats.value) {
          const data = stats.value as any;

          analytics.totalRequests += data.totalRequests || 0;
          analytics.successfulRequests += data.successfulRequests || 0;
          analytics.errorRequests += data.errorRequests || 0;
          totalResponseTime += data.totalResponseTime || 0;

          // Aggregate endpoint stats
          if (data.endpoints) {
            for (
              const [endpoint, endpointData] of Object.entries(
                data.endpoints as any,
              )
            ) {
              if (!endpointStats[endpoint]) {
                endpointStats[endpoint] = { count: 0, totalTime: 0 };
              }
              endpointStats[endpoint].count += endpointData.count || 0;
              endpointStats[endpoint].totalTime +=
                endpointData.totalResponseTime || 0;
            }
          }

          // Aggregate status codes
          if (data.statusCodes) {
            for (
              const [statusCode, count] of Object.entries(
                data.statusCodes as any,
              )
            ) {
              analytics.statusCodeBreakdown[parseInt(statusCode)] =
                (analytics.statusCodeBreakdown[parseInt(statusCode)] || 0) +
                (count as number);
            }
          }

          // Aggregate user stats
          if (data.users) {
            for (const [userId, count] of Object.entries(data.users as any)) {
              userStats[userId] = (userStats[userId] || 0) + (count as number);
            }
          }
        }
      }

      // Calculate averages and top endpoints
      if (analytics.totalRequests > 0) {
        analytics.averageResponseTime = totalResponseTime /
          analytics.totalRequests;
      }

      // Sort and limit top endpoints
      analytics.topEndpoints = Object.entries(endpointStats)
        .map(([endpoint, stats]) => ({
          endpoint,
          count: stats.count,
          averageResponseTime: stats.count > 0
            ? stats.totalTime / stats.count
            : 0,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Convert user stats
      analytics.userBreakdown = Object.entries(userStats)
        .map(([userId, count]) => ({
          userId: userId !== "anonymous" ? userId as UUID : undefined,
          requestCount: count,
        }))
        .sort((a, b) => b.requestCount - a.requestCount)
        .slice(0, 20);

      return analytics;
    } catch (error) {
      console.error("Error getting analytics:", error);
      throw error;
    }
  }

  // Generate time keys for a range
  private generateTimeKeys(
    startTime: number,
    endTime: number,
    granularity: "hour" | "day",
  ): string[] {
    const keys: string[] = [];
    const start = new Date(startTime);
    const end = new Date(endTime);

    if (granularity === "hour") {
      const current = new Date(start);
      current.setMinutes(0, 0, 0);

      while (current <= end) {
        const key =
          `${current.getFullYear()}-${current.getMonth()}-${current.getDate()}-${current.getHours()}`;
        keys.push(key);
        current.setHours(current.getHours() + 1);
      }
    } else {
      const current = new Date(start);
      current.setHours(0, 0, 0, 0);

      while (current <= end) {
        const key =
          `${current.getFullYear()}-${current.getMonth()}-${current.getDate()}`;
        keys.push(key);
        current.setDate(current.getDate() + 1);
      }
    }

    return keys;
  }

  // Get real-time metrics
  async getRealTimeMetrics(): Promise<{
    currentRPS: number;
    currentErrorRate: number;
    averageResponseTime: number;
    timestamp: number;
  }> {
    const connection = db.getConnection();
    const kv = connection.kv as Deno.Kv;

    try {
      const currentWindow = Math.floor(Date.now() / (5 * 60 * 1000));
      const realtimeKey = [
        "api_analytics",
        "realtime",
        currentWindow.toString(),
      ];

      const stats = await kv.get(realtimeKey);
      const data = stats.value as any;

      if (!data) {
        return {
          currentRPS: 0,
          currentErrorRate: 0,
          averageResponseTime: 0,
          timestamp: Date.now(),
        };
      }

      const rps = data.requests / (5 * 60); // requests per second over 5 minutes
      const errorRate = data.requests > 0
        ? (data.errors / data.requests) * 100
        : 0;
      const avgResponseTime = data.requests > 0
        ? data.totalResponseTime / data.requests
        : 0;

      return {
        currentRPS: rps,
        currentErrorRate: errorRate,
        averageResponseTime: avgResponseTime,
        timestamp: data.timestamp,
      };
    } catch (error) {
      console.error("Error getting real-time metrics:", error);
      return {
        currentRPS: 0,
        currentErrorRate: 0,
        averageResponseTime: 0,
        timestamp: Date.now(),
      };
    }
  }
}

// Export singleton instance
export const apiAnalytics = APIAnalyticsManager.getInstance();
