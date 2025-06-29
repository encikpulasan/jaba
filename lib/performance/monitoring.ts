// Performance Monitoring & Alerting System
// Real-time performance tracking with intelligent alerting

import { db } from "@/lib/db/connection.ts";
import { cache } from "@/lib/cache/multi-layer.ts";

export interface PerformanceMetric {
  id: string;
  name: string;
  value: number;
  unit: string;
  timestamp: number;
  category: "response_time" | "throughput" | "error_rate" | "memory" | "cache";
  threshold?: {
    warning: number;
    critical: number;
  };
}

export interface PerformanceAlert {
  id: string;
  metricName: string;
  level: "warning" | "critical";
  value: number;
  threshold: number;
  message: string;
  timestamp: number;
  resolved: boolean;
}

export interface SystemHealth {
  status: "healthy" | "warning" | "critical";
  uptime: number;
  responseTime: number;
  errorRate: number;
  memoryUsage: number;
  cacheHitRate: number;
  activeConnections: number;
  lastUpdate: number;
}

class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, PerformanceMetric[]>;
  private alerts: PerformanceAlert[];
  private healthStatus: SystemHealth;

  private constructor() {
    this.metrics = new Map();
    this.alerts = [];
    this.healthStatus = {
      status: "healthy",
      uptime: 0,
      responseTime: 0,
      errorRate: 0,
      memoryUsage: 0,
      cacheHitRate: 0,
      activeConnections: 0,
      lastUpdate: Date.now(),
    };

    this.startMonitoring();
  }

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  // Record performance metrics
  recordMetric(metric: Omit<PerformanceMetric, "id" | "timestamp">): void {
    const fullMetric: PerformanceMetric = {
      ...metric,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };

    if (!this.metrics.has(metric.name)) {
      this.metrics.set(metric.name, []);
    }

    const metricHistory = this.metrics.get(metric.name)!;
    metricHistory.push(fullMetric);

    // Keep only last 1000 metrics per type
    if (metricHistory.length > 1000) {
      metricHistory.shift();
    }

    // Check thresholds and create alerts
    this.checkThresholds(fullMetric);

    // Update health status
    this.updateHealthStatus();
  }

  // Real-time response time tracking
  trackResponseTime(endpoint: string, duration: number): void {
    this.recordMetric({
      name: `response_time_${endpoint}`,
      value: duration,
      unit: "ms",
      category: "response_time",
      threshold: {
        warning: 1000, // 1 second
        critical: 5000, // 5 seconds
      },
    });
  }

  // Track throughput (requests per second)
  trackThroughput(endpoint: string, requestCount: number): void {
    this.recordMetric({
      name: `throughput_${endpoint}`,
      value: requestCount,
      unit: "req/s",
      category: "throughput",
      threshold: {
        warning: 50,
        critical: 100,
      },
    });
  }

  // Track error rates
  trackErrorRate(endpoint: string, errorRate: number): void {
    this.recordMetric({
      name: `error_rate_${endpoint}`,
      value: errorRate,
      unit: "%",
      category: "error_rate",
      threshold: {
        warning: 5, // 5%
        critical: 10, // 10%
      },
    });
  }

  // Track memory usage
  trackMemoryUsage(): void {
    // Mock implementation - in production, use actual memory monitoring
    const memoryUsage = Math.random() * 100; // 0-100%

    this.recordMetric({
      name: "memory_usage",
      value: memoryUsage,
      unit: "%",
      category: "memory",
      threshold: {
        warning: 80,
        critical: 90,
      },
    });
  }

  // Track cache performance
  trackCachePerformance(): void {
    const cacheMetrics = cache.getMetrics();

    this.recordMetric({
      name: "cache_hit_rate",
      value: cacheMetrics.hitRate,
      unit: "%",
      category: "cache",
      threshold: {
        warning: 70, // Below 70%
        critical: 50, // Below 50%
      },
    });
  }

  // Get current health status
  getHealthStatus(): SystemHealth {
    return { ...this.healthStatus };
  }

  // Get performance metrics
  getMetrics(
    metricName?: string,
    timeRange?: { start: number; end: number },
  ): PerformanceMetric[] {
    if (metricName) {
      const metrics = this.metrics.get(metricName) || [];
      if (timeRange) {
        return metrics.filter(
          (m) => m.timestamp >= timeRange.start && m.timestamp <= timeRange.end,
        );
      }
      return metrics;
    }

    // Return all metrics
    const allMetrics: PerformanceMetric[] = [];
    for (const metrics of this.metrics.values()) {
      allMetrics.push(...metrics);
    }

    if (timeRange) {
      return allMetrics.filter(
        (m) => m.timestamp >= timeRange.start && m.timestamp <= timeRange.end,
      );
    }

    return allMetrics;
  }

  // Get active alerts
  getAlerts(resolved = false): PerformanceAlert[] {
    return this.alerts.filter((alert) => alert.resolved === resolved);
  }

  // Resolve alert
  resolveAlert(alertId: string): void {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.resolved = true;
    }
  }

  // Performance analytics
  getPerformanceAnalytics(timeRange: { start: number; end: number }): {
    averageResponseTime: number;
    totalRequests: number;
    errorRate: number;
    cacheHitRate: number;
    slowestEndpoints: Array<{ endpoint: string; avgTime: number }>;
    alertSummary: { total: number; critical: number; warning: number };
  } {
    const metrics = this.getMetrics(undefined, timeRange);

    const responseTimeMetrics = metrics.filter((m) =>
      m.category === "response_time"
    );
    const throughputMetrics = metrics.filter((m) =>
      m.category === "throughput"
    );
    const errorMetrics = metrics.filter((m) => m.category === "error_rate");
    const cacheMetrics = metrics.filter((m) => m.category === "cache");

    const averageResponseTime = responseTimeMetrics.length > 0
      ? responseTimeMetrics.reduce((sum, m) => sum + m.value, 0) /
        responseTimeMetrics.length
      : 0;

    const totalRequests = throughputMetrics.reduce(
      (sum, m) => sum + m.value,
      0,
    );

    const errorRate = errorMetrics.length > 0
      ? errorMetrics.reduce((sum, m) => sum + m.value, 0) / errorMetrics.length
      : 0;

    const cacheHitRate = cacheMetrics.length > 0
      ? cacheMetrics.reduce((sum, m) => sum + m.value, 0) / cacheMetrics.length
      : 0;

    // Calculate slowest endpoints
    const endpointTimes = new Map<string, number[]>();
    responseTimeMetrics.forEach((metric) => {
      const endpoint = metric.name.replace("response_time_", "");
      if (!endpointTimes.has(endpoint)) {
        endpointTimes.set(endpoint, []);
      }
      endpointTimes.get(endpoint)!.push(metric.value);
    });

    const slowestEndpoints = Array.from(endpointTimes.entries())
      .map(([endpoint, times]) => ({
        endpoint,
        avgTime: times.reduce((sum, time) => sum + time, 0) / times.length,
      }))
      .sort((a, b) => b.avgTime - a.avgTime)
      .slice(0, 5);

    // Alert summary
    const recentAlerts = this.alerts.filter(
      (a) => a.timestamp >= timeRange.start && a.timestamp <= timeRange.end,
    );
    const alertSummary = {
      total: recentAlerts.length,
      critical: recentAlerts.filter((a) => a.level === "critical").length,
      warning: recentAlerts.filter((a) => a.level === "warning").length,
    };

    return {
      averageResponseTime,
      totalRequests,
      errorRate,
      cacheHitRate,
      slowestEndpoints,
      alertSummary,
    };
  }

  // Private methods
  private checkThresholds(metric: PerformanceMetric): void {
    if (!metric.threshold) return;

    let alertLevel: "warning" | "critical" | null = null;
    let threshold = 0;

    if (metric.value >= metric.threshold.critical) {
      alertLevel = "critical";
      threshold = metric.threshold.critical;
    } else if (metric.value >= metric.threshold.warning) {
      alertLevel = "warning";
      threshold = metric.threshold.warning;
    }

    if (alertLevel) {
      const alert: PerformanceAlert = {
        id: crypto.randomUUID(),
        metricName: metric.name,
        level: alertLevel,
        value: metric.value,
        threshold,
        message:
          `${metric.name} is ${metric.value}${metric.unit}, exceeding ${alertLevel} threshold of ${threshold}${metric.unit}`,
        timestamp: Date.now(),
        resolved: false,
      };

      this.alerts.push(alert);

      // Keep only last 100 alerts
      if (this.alerts.length > 100) {
        this.alerts.shift();
      }

      console.warn(
        `⚠️ Performance Alert [${alertLevel.toUpperCase()}]: ${alert.message}`,
      );
    }
  }

  private updateHealthStatus(): void {
    const now = Date.now();
    const fiveMinutesAgo = now - (5 * 60 * 1000);

    // Get recent metrics
    const recentMetrics = this.getMetrics(undefined, {
      start: fiveMinutesAgo,
      end: now,
    });

    const responseTimeMetrics = recentMetrics.filter((m) =>
      m.category === "response_time"
    );
    const errorMetrics = recentMetrics.filter((m) =>
      m.category === "error_rate"
    );
    const memoryMetrics = recentMetrics.filter((m) => m.category === "memory");
    const cacheMetrics = recentMetrics.filter((m) => m.category === "cache");

    // Calculate health indicators
    const avgResponseTime = responseTimeMetrics.length > 0
      ? responseTimeMetrics.reduce((sum, m) => sum + m.value, 0) /
        responseTimeMetrics.length
      : 0;

    const avgErrorRate = errorMetrics.length > 0
      ? errorMetrics.reduce((sum, m) => sum + m.value, 0) / errorMetrics.length
      : 0;

    const avgMemoryUsage = memoryMetrics.length > 0
      ? memoryMetrics.reduce((sum, m) => sum + m.value, 0) /
        memoryMetrics.length
      : 0;

    const avgCacheHitRate = cacheMetrics.length > 0
      ? cacheMetrics.reduce((sum, m) => sum + m.value, 0) / cacheMetrics.length
      : 100;

    // Determine overall health status
    let status: "healthy" | "warning" | "critical" = "healthy";

    if (avgResponseTime > 5000 || avgErrorRate > 10 || avgMemoryUsage > 90) {
      status = "critical";
    } else if (
      avgResponseTime > 1000 || avgErrorRate > 5 || avgMemoryUsage > 80 ||
      avgCacheHitRate < 70
    ) {
      status = "warning";
    }

    this.healthStatus = {
      status,
      uptime: now - this.healthStatus.lastUpdate, // Simplified uptime calculation
      responseTime: avgResponseTime,
      errorRate: avgErrorRate,
      memoryUsage: avgMemoryUsage,
      cacheHitRate: avgCacheHitRate,
      activeConnections: Math.floor(Math.random() * 100), // Mock data
      lastUpdate: now,
    };
  }

  private startMonitoring(): void {
    // Monitor system metrics every 30 seconds
    setInterval(() => {
      this.trackMemoryUsage();
      this.trackCachePerformance();
    }, 30000);

    // Update health status every minute
    setInterval(() => {
      this.updateHealthStatus();
    }, 60000);
  }
}

// Export singleton instance
export const performanceMonitor = PerformanceMonitor.getInstance();

// Middleware function for automatic request tracking
export function createPerformanceMiddleware() {
  return async (
    request: Request,
    next: () => Promise<Response>,
  ): Promise<Response> => {
    const startTime = Date.now();
    const url = new URL(request.url);
    const endpoint = url.pathname;

    try {
      const response = await next();

      // Track response time
      const duration = Date.now() - startTime;
      performanceMonitor.trackResponseTime(endpoint, duration);

      // Track error rate
      const isError = response.status >= 400;
      performanceMonitor.trackErrorRate(endpoint, isError ? 100 : 0);

      return response;
    } catch (error) {
      // Track error
      const duration = Date.now() - startTime;
      performanceMonitor.trackResponseTime(endpoint, duration);
      performanceMonitor.trackErrorRate(endpoint, 100);

      throw error;
    }
  };
}
