// Performance Monitoring Service
// Real-time performance monitoring and alerting system

import { db } from "@/lib/db/connection.ts";
import { DbPatterns } from "@/lib/db/patterns.ts";
import type {
  AlertSeverity,
  PerformanceAlert,
  PerformanceDashboard,
  PerformanceLevel,
  PerformanceMetric,
  PerformanceMetricType,
  SystemResourceMetrics,
} from "@/types/performance.ts";
import type { UUID } from "@/types/base.ts";

export class PerformanceMonitoringService {
  private metricsCollection: Map<string, PerformanceMetric[]> = new Map();
  private alertsActive: Map<string, PerformanceAlert> = new Map();
  private monitoringInterval?: ReturnType<typeof setInterval>;
  private isMonitoring = false;

  // Configuration
  private readonly thresholds = {
    responseTime: {
      excellent: 100,
      good: 300,
      fair: 800,
      poor: 2000,
    },
    memoryUsage: {
      warning: 80,
      critical: 95,
    },
    cpuUsage: {
      warning: 75,
      critical: 90,
    },
    errorRate: {
      warning: 1,
      critical: 5,
    },
    cacheHitRate: {
      excellent: 95,
      good: 85,
      fair: 70,
    },
  };

  // Start monitoring
  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    console.log("🔍 Starting performance monitoring...");

    // Collect metrics every 30 seconds
    this.monitoringInterval = setInterval(async () => {
      await this.collectMetrics();
    }, 30000);

    // Initial collection
    await this.collectMetrics();
  }

  // Stop monitoring
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    this.isMonitoring = false;
    console.log("⏹️ Stopped performance monitoring");
  }

  // Collect system metrics
  private async collectMetrics(): Promise<void> {
    try {
      const timestamp = new Date();

      // Collect system resource metrics
      const systemMetrics = await this.collectSystemMetrics(timestamp);
      await this.storeMetric(systemMetrics);

      // Collect cache metrics
      const cacheMetrics = await this.collectCacheMetrics(timestamp);
      await this.storeMetric(cacheMetrics);

      // Collect API metrics
      const apiMetrics = await this.collectAPIMetrics(timestamp);
      await this.storeMetric(apiMetrics);

      // Check for alerts
      await this.checkAlerts();

      console.log(
        `📊 Collected performance metrics at ${timestamp.toISOString()}`,
      );
    } catch (error) {
      console.error("❌ Error collecting metrics:", error);
    }
  }

  // Collect system resource metrics
  private async collectSystemMetrics(
    timestamp: Date,
  ): Promise<PerformanceMetric> {
    // Simulate system metrics collection
    // In production, use Deno.systemCpuInfo(), Deno.systemMemoryInfo(), etc.
    const cpuUsage = Math.random() * 100;
    const memoryUsage = Math.random() * 100;

    // Store detailed system metrics
    const systemMetrics: SystemResourceMetrics = {
      id: crypto.randomUUID(),
      cpu: {
        usage: cpuUsage,
        cores: 8,
      },
      memory: {
        total: 8 * 1024 * 1024 * 1024, // 8GB
        used: (memoryUsage / 100) * 8 * 1024 * 1024 * 1024,
        usage: memoryUsage,
      },
      disk: {
        total: 512 * 1024 * 1024 * 1024, // 512GB
        used: (Math.random() * 60) * 512 * 1024 * 1024 * 1024 / 100,
        usage: Math.random() * 60,
      },
      timestamp,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.set(
      DbPatterns.performance.systemMetrics(systemMetrics.id),
      systemMetrics,
    );

    // Return primary CPU metric
    return {
      id: crypto.randomUUID(),
      type: "cpu_usage",
      value: cpuUsage,
      unit: "percentage",
      timestamp,
      source: "system",
      level: this.getPerformanceLevel("cpu_usage", cpuUsage),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  // Collect cache metrics
  private async collectCacheMetrics(
    timestamp: Date,
  ): Promise<PerformanceMetric> {
    // Simulate cache metrics
    const hitRate = 70 + Math.random() * 25; // 70-95%
    const responseTime = 5 + Math.random() * 20; // 5-25ms

    return {
      id: crypto.randomUUID(),
      type: "cache_hit_rate",
      value: hitRate,
      unit: "percentage",
      timestamp,
      source: "cache",
      level: this.getPerformanceLevel("cache_hit_rate", hitRate),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  // Collect API metrics
  private async collectAPIMetrics(timestamp: Date): Promise<PerformanceMetric> {
    // Simulate API metrics
    const responseTime = 100 + Math.random() * 400; // 100-500ms
    const errorRate = Math.random() * 3; // 0-3%

    return {
      id: crypto.randomUUID(),
      type: "api_latency",
      value: responseTime,
      unit: "milliseconds",
      timestamp,
      source: "api",
      level: this.getPerformanceLevel("response_time", responseTime),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  // Store performance metric
  private async storeMetric(metric: PerformanceMetric): Promise<void> {
    await db.set(DbPatterns.performance.metric(metric.id), metric);

    // Store in time-series index
    const timeKey = `${Math.floor(Date.now() / 60000)}`; // 1-minute buckets
    await db.set(
      DbPatterns.performance.metricsByTime(metric.type, timeKey, metric.id),
      metric.id,
    );

    // Store in memory for real-time access
    if (!this.metricsCollection.has(metric.type)) {
      this.metricsCollection.set(metric.type, []);
    }
    const metrics = this.metricsCollection.get(metric.type)!;
    metrics.push(metric);

    // Keep only last 100 metrics in memory
    if (metrics.length > 100) {
      metrics.shift();
    }
  }

  // Get performance level based on metric type and value
  private getPerformanceLevel(
    type: PerformanceMetricType,
    value: number,
  ): PerformanceLevel {
    switch (type) {
      case "response_time":
      case "api_latency":
        if (value <= this.thresholds.responseTime.excellent) return "excellent";
        if (value <= this.thresholds.responseTime.good) return "good";
        if (value <= this.thresholds.responseTime.fair) return "fair";
        if (value <= this.thresholds.responseTime.poor) return "poor";
        return "critical";

      case "cpu_usage":
      case "memory_usage":
        if (value <= 50) return "excellent";
        if (value <= 70) return "good";
        if (value <= 85) return "fair";
        if (value <= 95) return "poor";
        return "critical";

      case "cache_hit_rate":
        if (value >= this.thresholds.cacheHitRate.excellent) return "excellent";
        if (value >= this.thresholds.cacheHitRate.good) return "good";
        if (value >= this.thresholds.cacheHitRate.fair) return "fair";
        return "poor";

      case "error_rate":
        if (value <= 0.1) return "excellent";
        if (value <= 0.5) return "good";
        if (value <= 1) return "fair";
        if (value <= 5) return "poor";
        return "critical";

      default:
        return "good";
    }
  }

  // Check for alerts
  private async checkAlerts(): Promise<void> {
    const recentMetrics = await this.getRecentMetrics(5 * 60 * 1000); // Last 5 minutes

    for (const [type, metrics] of recentMetrics.entries()) {
      if (metrics.length === 0) continue;

      const latestMetric = metrics[metrics.length - 1];
      const alertKey = `${type}_${latestMetric.source}`;

      // Check if alert conditions are met
      const shouldAlert = this.shouldCreateAlert(latestMetric);

      if (shouldAlert && !this.alertsActive.has(alertKey)) {
        // Create new alert
        const alert = await this.createAlert(latestMetric);
        this.alertsActive.set(alertKey, alert);
        console.log(`🚨 ALERT: ${alert.title} - ${alert.message}`);
      } else if (!shouldAlert && this.alertsActive.has(alertKey)) {
        // Resolve existing alert
        await this.resolveAlert(alertKey);
      }
    }
  }

  // Check if alert should be created
  private shouldCreateAlert(metric: PerformanceMetric): boolean {
    switch (metric.type) {
      case "cpu_usage":
      case "memory_usage":
        return metric.value >= this.thresholds.cpuUsage.warning;

      case "response_time":
      case "api_latency":
        return metric.value >= this.thresholds.responseTime.poor;

      case "error_rate":
        return metric.value >= this.thresholds.errorRate.warning;

      case "cache_hit_rate":
        return metric.value < this.thresholds.cacheHitRate.fair;

      default:
        return false;
    }
  }

  // Create performance alert
  private async createAlert(
    metric: PerformanceMetric,
  ): Promise<PerformanceAlert> {
    const alert: PerformanceAlert = {
      id: crypto.randomUUID(),
      type: metric.type,
      severity: this.getAlertSeverity(metric),
      title: this.getAlertTitle(metric),
      message: this.getAlertMessage(metric),
      value: metric.value,
      threshold: this.getThreshold(metric.type),
      source: metric.source,
      timestamp: new Date(),
      resolved: false,
      organizationId: metric.organizationId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.set(DbPatterns.performance.alert(alert.id), alert);
    return alert;
  }

  // Resolve alert
  private async resolveAlert(alertKey: string): Promise<void> {
    const alert = this.alertsActive.get(alertKey);
    if (!alert) return;

    alert.resolved = true;
    alert.resolvedAt = new Date();
    alert.updatedAt = Date.now();

    await db.set(DbPatterns.performance.alert(alert.id), alert);
    this.alertsActive.delete(alertKey);

    console.log(`✅ RESOLVED: ${alert.title}`);
  }

  // Get alert severity
  private getAlertSeverity(metric: PerformanceMetric): AlertSeverity {
    switch (metric.level) {
      case "critical":
        return "critical";
      case "poor":
        return "error";
      case "fair":
        return "warning";
      default:
        return "info";
    }
  }

  // Get alert title
  private getAlertTitle(metric: PerformanceMetric): string {
    const titles = {
      cpu_usage: "High CPU Usage",
      memory_usage: "High Memory Usage",
      response_time: "Slow Response Time",
      api_latency: "High API Latency",
      error_rate: "High Error Rate",
      cache_hit_rate: "Low Cache Hit Rate",
    };
    return titles[metric.type] || "Performance Alert";
  }

  // Get alert message
  private getAlertMessage(metric: PerformanceMetric): string {
    return `${
      metric.type.replace("_", " ").toUpperCase()
    } is ${metric.value}${metric.unit} from ${metric.source}`;
  }

  // Get threshold for metric type
  private getThreshold(type: PerformanceMetricType): number {
    switch (type) {
      case "cpu_usage":
      case "memory_usage":
        return this.thresholds.cpuUsage.warning;
      case "response_time":
      case "api_latency":
        return this.thresholds.responseTime.poor;
      case "error_rate":
        return this.thresholds.errorRate.warning;
      case "cache_hit_rate":
        return this.thresholds.cacheHitRate.fair;
      default:
        return 0;
    }
  }

  // Get recent metrics
  async getRecentMetrics(
    timeWindow: number,
  ): Promise<Map<PerformanceMetricType, PerformanceMetric[]>> {
    const cutoff = new Date(Date.now() - timeWindow);
    const recentMetrics = new Map<PerformanceMetricType, PerformanceMetric[]>();

    for (const [type, metrics] of this.metricsCollection.entries()) {
      const recent = metrics.filter((m) => m.timestamp >= cutoff);
      recentMetrics.set(type as PerformanceMetricType, recent);
    }

    return recentMetrics;
  }

  // Get performance dashboard data
  async getDashboard(): Promise<PerformanceDashboard> {
    const recentMetrics = await this.getRecentMetrics(5 * 60 * 1000); // Last 5 minutes
    const activeAlerts = Array.from(this.alertsActive.values());

    // Calculate averages and current values
    const cpuMetrics = recentMetrics.get("cpu_usage") || [];
    const memoryMetrics = recentMetrics.get("memory_usage") || [];
    const responseMetrics = recentMetrics.get("api_latency") || [];
    const cacheMetrics = recentMetrics.get("cache_hit_rate") || [];
    const errorMetrics = recentMetrics.get("error_rate") || [];

    const avgCpu = cpuMetrics.length > 0
      ? cpuMetrics.reduce((sum, m) => sum + m.value, 0) / cpuMetrics.length
      : 0;
    const avgMemory = memoryMetrics.length > 0
      ? memoryMetrics.reduce((sum, m) => sum + m.value, 0) /
        memoryMetrics.length
      : 0;
    const avgResponse = responseMetrics.length > 0
      ? responseMetrics.reduce((sum, m) => sum + m.value, 0) /
        responseMetrics.length
      : 0;
    const avgCache = cacheMetrics.length > 0
      ? cacheMetrics.reduce((sum, m) => sum + m.value, 0) / cacheMetrics.length
      : 0;
    const avgError = errorMetrics.length > 0
      ? errorMetrics.reduce((sum, m) => sum + m.value, 0) / errorMetrics.length
      : 0;

    // Calculate overall performance score
    const score = this.calculatePerformanceScore({
      cpu: avgCpu,
      memory: avgMemory,
      responseTime: avgResponse,
      cacheHitRate: avgCache,
      errorRate: avgError,
    });

    return {
      overview: {
        status: this.getOverallStatus(score),
        score,
        uptime: 99.9, // Simulated uptime
        lastUpdated: new Date(),
      },
      realTimeMetrics: {
        activeUsers: Math.floor(Math.random() * 1000) + 100,
        requestsPerSecond: Math.floor(Math.random() * 50) + 10,
        averageResponseTime: avgResponse,
        errorRate: avgError,
        cacheHitRate: avgCache,
      },
      systemHealth: {
        cpu: avgCpu,
        memory: avgMemory,
        disk: Math.random() * 60, // Simulated disk usage
      },
      alerts: {
        active: activeAlerts.filter((a) => !a.resolved).length,
        critical: activeAlerts.filter((a) => a.severity === "critical").length,
        warnings: activeAlerts.filter((a) => a.severity === "warning").length,
      },
    };
  }

  // Calculate performance score
  private calculatePerformanceScore(metrics: {
    cpu: number;
    memory: number;
    responseTime: number;
    cacheHitRate: number;
    errorRate: number;
  }): number {
    let score = 100;

    // CPU penalty
    if (metrics.cpu > 80) score -= 20;
    else if (metrics.cpu > 60) score -= 10;
    else if (metrics.cpu > 40) score -= 5;

    // Memory penalty
    if (metrics.memory > 90) score -= 20;
    else if (metrics.memory > 70) score -= 10;
    else if (metrics.memory > 50) score -= 5;

    // Response time penalty
    if (metrics.responseTime > 1000) score -= 25;
    else if (metrics.responseTime > 500) score -= 15;
    else if (metrics.responseTime > 200) score -= 5;

    // Cache hit rate bonus/penalty
    if (metrics.cacheHitRate > 90) score += 5;
    else if (metrics.cacheHitRate < 70) score -= 10;
    else if (metrics.cacheHitRate < 50) score -= 20;

    // Error rate penalty
    if (metrics.errorRate > 5) score -= 30;
    else if (metrics.errorRate > 2) score -= 15;
    else if (metrics.errorRate > 1) score -= 5;

    return Math.max(0, Math.min(100, score));
  }

  // Get overall status
  private getOverallStatus(score: number): PerformanceLevel {
    if (score >= 90) return "excellent";
    if (score >= 75) return "good";
    if (score >= 60) return "fair";
    if (score >= 40) return "poor";
    return "critical";
  }

  // Get metrics by type
  async getMetricsByType(
    type: PerformanceMetricType,
    limit = 100,
  ): Promise<PerformanceMetric[]> {
    const metrics: PerformanceMetric[] = [];
    const iterator = db.list({
      prefix: [`performance_metric_by_time_${type}`],
    });

    for await (const entry of iterator) {
      const metricId = entry.value as UUID;
      const metric = await db.get(DbPatterns.performance.metric(metricId));
      if (metric.value) {
        metrics.push(metric.value as PerformanceMetric);
      }
      if (metrics.length >= limit) break;
    }

    return metrics.sort((a, b) =>
      b.timestamp.getTime() - a.timestamp.getTime()
    );
  }

  // Get active alerts
  async getActiveAlerts(): Promise<PerformanceAlert[]> {
    return Array.from(this.alertsActive.values());
  }

  // Get all alerts
  async getAllAlerts(limit = 50): Promise<PerformanceAlert[]> {
    const alerts: PerformanceAlert[] = [];
    const iterator = db.list({ prefix: ["performance_alert"] });

    for await (const entry of iterator) {
      alerts.push(entry.value as PerformanceAlert);
      if (alerts.length >= limit) break;
    }

    return alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  // Record custom metric
  async recordMetric(
    type: PerformanceMetricType,
    value: number,
    unit: string,
    source: string,
    organizationId?: UUID,
  ): Promise<void> {
    const metric: PerformanceMetric = {
      id: crypto.randomUUID(),
      type,
      value,
      unit,
      timestamp: new Date(),
      source,
      level: this.getPerformanceLevel(type, value),
      organizationId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await this.storeMetric(metric);
  }
}

// Global instance
export const performanceMonitor = new PerformanceMonitoringService();
