import { kv } from "../db/connection.ts";

export interface PerformanceMetric {
  id: string;
  timestamp: string;
  type: "request" | "database" | "cache" | "custom" | "error" | "system";
  name: string;
  value: number;
  unit: "ms" | "bytes" | "percent" | "count" | "rate";
  tags: Record<string, string>;
  organizationId?: string;
  userId?: string;
  sessionId?: string;
  traceId?: string;
  spanId?: string;
}

export interface ErrorEvent {
  id: string;
  timestamp: string;
  type: "javascript" | "api" | "database" | "system" | "network";
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  stack?: string;
  url?: string;
  userAgent?: string;
  userId?: string;
  sessionId?: string;
  tags: Record<string, string>;
  context: Record<string, unknown>;
  resolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
  fingerprint: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  organizationId?: string;
}

export interface HealthCheck {
  service: string;
  status: "healthy" | "warning" | "critical" | "unknown";
  timestamp: string;
  responseTime: number;
  details: Record<string, unknown>;
  dependencies: Array<{
    name: string;
    status: "healthy" | "unhealthy";
    responseTime: number;
    error?: string;
  }>;
}

export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  tags: Record<string, string>;
  logs: Array<{
    timestamp: string;
    fields: Record<string, unknown>;
  }>;
  status: "ok" | "error" | "timeout";
  errorMessage?: string;
}

export interface SystemMetrics {
  timestamp: string;
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  memory: {
    used: number;
    total: number;
    free: number;
    cached: number;
  };
  disk: {
    used: number;
    total: number;
    free: number;
    ioTime: number;
  };
  network: {
    bytesIn: number;
    bytesOut: number;
    packetsIn: number;
    packetsOut: number;
  };
  processes: {
    total: number;
    running: number;
    sleeping: number;
  };
}

export class APMService {
  private static instance: APMService;
  private metricsBuffer: PerformanceMetric[] = [];
  private errorBuffer: ErrorEvent[] = [];
  private activeTraces = new Map<string, TraceSpan[]>();
  private flushInterval = 10000; // 10 seconds
  private bufferSize = 1000;

  public static getInstance(): APMService {
    if (!APMService.instance) {
      APMService.instance = new APMService();
    }
    return APMService.instance;
  }

  constructor() {
    this.startPeriodicFlush();
    this.startSystemMetricsCollection();
  }

  // Performance Metrics Collection
  async recordMetric(
    type: PerformanceMetric["type"],
    name: string,
    value: number,
    unit: PerformanceMetric["unit"],
    tags: Record<string, string> = {},
    organizationId?: string,
    userId?: string,
  ): Promise<void> {
    const metric: PerformanceMetric = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type,
      name,
      value,
      unit,
      tags,
      organizationId,
      userId,
      traceId: this.getCurrentTraceId(),
      spanId: this.getCurrentSpanId(),
    };

    this.metricsBuffer.push(metric);

    if (this.metricsBuffer.length >= this.bufferSize) {
      await this.flushMetrics();
    }
  }

  async recordRequestMetric(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    size: number,
    userId?: string,
    organizationId?: string,
  ): Promise<void> {
    await this.recordMetric(
      "request",
      "http_request",
      duration,
      "ms",
      {
        method,
        path,
        status_code: statusCode.toString(),
        size: size.toString(),
      },
      organizationId,
      userId,
    );

    // Record additional metrics
    await this.recordMetric(
      "request",
      "request_count",
      1,
      "count",
      {
        method,
        path,
        status_code: statusCode.toString(),
      },
      organizationId,
      userId,
    );

    if (statusCode >= 400) {
      await this.recordMetric(
        "request",
        "error_count",
        1,
        "count",
        {
          method,
          path,
          status_code: statusCode.toString(),
        },
        organizationId,
        userId,
      );
    }
  }

  async recordDatabaseMetric(
    operation: string,
    table: string,
    duration: number,
    success: boolean,
    organizationId?: string,
  ): Promise<void> {
    await this.recordMetric(
      "database",
      "db_query",
      duration,
      "ms",
      {
        operation,
        table,
        success: success.toString(),
      },
      organizationId,
    );
  }

  async recordCacheMetric(
    operation: "hit" | "miss" | "set" | "delete",
    key: string,
    duration: number,
    organizationId?: string,
  ): Promise<void> {
    await this.recordMetric(
      "cache",
      "cache_operation",
      duration,
      "ms",
      {
        operation,
        key_prefix: key.split(":")[0] || "unknown",
      },
      organizationId,
    );
  }

  // Error Tracking
  async recordError(
    type: ErrorEvent["type"],
    message: string,
    stack?: string,
    context: Record<string, unknown> = {},
    severity: ErrorEvent["severity"] = "medium",
    userId?: string,
    organizationId?: string,
  ): Promise<string> {
    const fingerprint = this.generateErrorFingerprint(message, stack);
    const existingErrorResult = await kv.get([
      "monitoring",
      "errors",
      "by_fingerprint",
      fingerprint,
    ]);

    let errorEvent: ErrorEvent;

    if (existingErrorResult.value) {
      // Update existing error
      errorEvent = existingErrorResult.value as ErrorEvent;
      errorEvent.count++;
      errorEvent.lastSeen = new Date().toISOString();
      errorEvent.context = { ...errorEvent.context, ...context };
    } else {
      // Create new error
      errorEvent = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type,
        severity,
        message,
        stack,
        userId,
        organizationId,
        tags: {},
        context,
        resolved: false,
        fingerprint,
        count: 1,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
      };
    }

    this.errorBuffer.push(errorEvent);

    if (this.errorBuffer.length >= this.bufferSize) {
      await this.flushErrors();
    }

    // Send critical error alerts immediately
    if (severity === "critical") {
      await this.sendCriticalErrorAlert(errorEvent);
    }

    return errorEvent.id;
  }

  // Distributed Tracing
  startTrace(operationName: string, tags: Record<string, string> = {}): string {
    const traceId = crypto.randomUUID();
    const spanId = crypto.randomUUID();

    const span: TraceSpan = {
      traceId,
      spanId,
      operationName,
      startTime: new Date().toISOString(),
      tags,
      logs: [],
      status: "ok",
    };

    if (!this.activeTraces.has(traceId)) {
      this.activeTraces.set(traceId, []);
    }
    this.activeTraces.get(traceId)!.push(span);

    return traceId;
  }

  startSpan(
    traceId: string,
    operationName: string,
    parentSpanId?: string,
    tags: Record<string, string> = {},
  ): string {
    const spanId = crypto.randomUUID();

    const span: TraceSpan = {
      traceId,
      spanId,
      parentSpanId,
      operationName,
      startTime: new Date().toISOString(),
      tags,
      logs: [],
      status: "ok",
    };

    if (!this.activeTraces.has(traceId)) {
      this.activeTraces.set(traceId, []);
    }
    this.activeTraces.get(traceId)!.push(span);

    return spanId;
  }

  finishSpan(
    traceId: string,
    spanId: string,
    status: "ok" | "error" | "timeout" = "ok",
    errorMessage?: string,
  ): void {
    const spans = this.activeTraces.get(traceId);
    if (!spans) return;

    const span = spans.find((s) => s.spanId === spanId);
    if (!span) return;

    span.endTime = new Date().toISOString();
    span.duration = new Date(span.endTime).getTime() -
      new Date(span.startTime).getTime();
    span.status = status;
    span.errorMessage = errorMessage;
  }

  addSpanLog(
    traceId: string,
    spanId: string,
    fields: Record<string, unknown>,
  ): void {
    const spans = this.activeTraces.get(traceId);
    if (!spans) return;

    const span = spans.find((s) => s.spanId === spanId);
    if (!span) return;

    span.logs.push({
      timestamp: new Date().toISOString(),
      fields,
    });
  }

  async finishTrace(traceId: string): Promise<void> {
    const spans = this.activeTraces.get(traceId);
    if (!spans) return;

    // Store the complete trace
    await kv.set(["monitoring", "traces", traceId], {
      traceId,
      spans,
      startTime: spans[0]?.startTime,
      endTime: new Date().toISOString(),
      duration: spans.reduce(
        (max, span) => Math.max(max, span.duration || 0),
        0,
      ),
    });

    this.activeTraces.delete(traceId);
  }

  // Health Checks
  async performHealthCheck(): Promise<HealthCheck> {
    const startTime = Date.now();

    const dependencies = await Promise.all([
      this.checkDatabaseHealth(),
      this.checkCacheHealth(),
      this.checkExternalServices(),
    ]);

    const responseTime = Date.now() - startTime;
    const overallStatus = dependencies.every((dep) => dep.status === "healthy")
      ? "healthy"
      : dependencies.some((dep) => dep.status === "unhealthy")
      ? "critical"
      : "warning";

    const healthCheck: HealthCheck = {
      service: "masmaCMS",
      status: overallStatus,
      timestamp: new Date().toISOString(),
      responseTime,
      details: {
        version: "1.0.0",
        uptime: process.uptime(),
        memoryUsage: Deno.memoryUsage(),
      },
      dependencies,
    };

    await kv.set(["monitoring", "health", "latest"], healthCheck);
    await kv.set(
      ["monitoring", "health", "history", new Date().toISOString()],
      healthCheck,
    );

    return healthCheck;
  }

  private async checkDatabaseHealth(): Promise<HealthCheck["dependencies"][0]> {
    const startTime = Date.now();
    try {
      await kv.get(["health", "check"]);
      return {
        name: "database",
        status: "healthy",
        responseTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        name: "database",
        status: "unhealthy",
        responseTime: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  private async checkCacheHealth(): Promise<HealthCheck["dependencies"][0]> {
    const startTime = Date.now();
    try {
      // Test cache operation
      const testKey = ["health", "cache_test"];
      await kv.set(testKey, { test: true });
      await kv.get(testKey);
      await kv.delete(testKey);

      return {
        name: "cache",
        status: "healthy",
        responseTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        name: "cache",
        status: "unhealthy",
        responseTime: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  private async checkExternalServices(): Promise<
    HealthCheck["dependencies"][0]
  > {
    const startTime = Date.now();
    // In a real implementation, this would check external APIs, CDNs, etc.
    return {
      name: "external_services",
      status: "healthy",
      responseTime: Date.now() - startTime,
    };
  }

  // System Metrics Collection
  private async collectSystemMetrics(): Promise<SystemMetrics> {
    const memoryUsage = Deno.memoryUsage();

    return {
      timestamp: new Date().toISOString(),
      cpu: {
        usage: 0, // Would need OS-specific implementation
        loadAverage: [0, 0, 0], // Would need OS-specific implementation
      },
      memory: {
        used: memoryUsage.rss,
        total: memoryUsage.heapTotal,
        free: memoryUsage.heapTotal - memoryUsage.heapUsed,
        cached: 0,
      },
      disk: {
        used: 0, // Would need OS-specific implementation
        total: 0,
        free: 0,
        ioTime: 0,
      },
      network: {
        bytesIn: 0, // Would need OS-specific implementation
        bytesOut: 0,
        packetsIn: 0,
        packetsOut: 0,
      },
      processes: {
        total: 0, // Would need OS-specific implementation
        running: 0,
        sleeping: 0,
      },
    };
  }

  // Analytics and Reporting
  async getMetrics(
    type?: PerformanceMetric["type"],
    startTime?: string,
    endTime?: string,
    organizationId?: string,
  ): Promise<PerformanceMetric[]> {
    const metrics: PerformanceMetric[] = [];
    let prefix = ["monitoring", "metrics"];

    if (organizationId) {
      prefix = ["monitoring", "metrics", "by_org", organizationId];
    }

    const iter = kv.list({ prefix });

    for await (const entry of iter) {
      const metric = entry.value as PerformanceMetric;

      if (type && metric.type !== type) continue;
      if (startTime && metric.timestamp < startTime) continue;
      if (endTime && metric.timestamp > endTime) continue;

      metrics.push(metric);
    }

    return metrics.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  async getErrors(
    resolved?: boolean,
    severity?: ErrorEvent["severity"],
    organizationId?: string,
  ): Promise<ErrorEvent[]> {
    const errors: ErrorEvent[] = [];
    let prefix = ["monitoring", "errors"];

    if (organizationId) {
      prefix = ["monitoring", "errors", "by_org", organizationId];
    }

    const iter = kv.list({ prefix });

    for await (const entry of iter) {
      const error = entry.value as ErrorEvent;

      if (resolved !== undefined && error.resolved !== resolved) continue;
      if (severity && error.severity !== severity) continue;

      errors.push(error);
    }

    return errors.sort((a, b) =>
      new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
    );
  }

  async getPerformanceSummary(
    startTime: string,
    endTime: string,
    organizationId?: string,
  ): Promise<Record<string, unknown>> {
    const metrics = await this.getMetrics(
      undefined,
      startTime,
      endTime,
      organizationId,
    );
    const errors = await this.getErrors(undefined, undefined, organizationId);

    const requestMetrics = metrics.filter((m) => m.type === "request");
    const avgResponseTime = requestMetrics.length > 0
      ? requestMetrics.reduce((sum, m) => sum + m.value, 0) /
        requestMetrics.length
      : 0;

    const errorRate = requestMetrics.length > 0
      ? errors.length / requestMetrics.length
      : 0;

    return {
      period: { startTime, endTime },
      requests: {
        total: requestMetrics.length,
        avgResponseTime: Math.round(avgResponseTime),
        errorRate: Math.round(errorRate * 100) / 100,
      },
      errors: {
        total: errors.length,
        critical: errors.filter((e) => e.severity === "critical").length,
        unresolved: errors.filter((e) => !e.resolved).length,
      },
      performance: {
        p95ResponseTime: this.calculatePercentile(
          requestMetrics.map((m) => m.value),
          95,
        ),
        p99ResponseTime: this.calculatePercentile(
          requestMetrics.map((m) => m.value),
          99,
        ),
      },
    };
  }

  // Utility Methods
  private async flushMetrics(): Promise<void> {
    if (this.metricsBuffer.length === 0) return;

    const metricsToFlush = [...this.metricsBuffer];
    this.metricsBuffer = [];

    for (const metric of metricsToFlush) {
      await kv.set(["monitoring", "metrics", metric.id], metric);

      if (metric.organizationId) {
        await kv.set([
          "monitoring",
          "metrics",
          "by_org",
          metric.organizationId,
          metric.id,
        ], metric.id);
      }

      // Create time-series indexes
      const day = metric.timestamp.split("T")[0];
      await kv.set(
        ["monitoring", "metrics", "by_day", day, metric.id],
        metric.id,
      );
    }
  }

  private async flushErrors(): Promise<void> {
    if (this.errorBuffer.length === 0) return;

    const errorsToFlush = [...this.errorBuffer];
    this.errorBuffer = [];

    for (const error of errorsToFlush) {
      await kv.set(["monitoring", "errors", error.id], error);
      await kv.set([
        "monitoring",
        "errors",
        "by_fingerprint",
        error.fingerprint,
      ], error);

      if (error.organizationId) {
        await kv.set([
          "monitoring",
          "errors",
          "by_org",
          error.organizationId,
          error.id,
        ], error.id);
      }
    }
  }

  private startPeriodicFlush(): void {
    setInterval(async () => {
      await this.flushMetrics();
      await this.flushErrors();
    }, this.flushInterval);
  }

  private startSystemMetricsCollection(): void {
    setInterval(async () => {
      const metrics = await this.collectSystemMetrics();
      await kv.set(
        ["monitoring", "system_metrics", metrics.timestamp],
        metrics,
      );
    }, 60000); // Every minute
  }

  private generateErrorFingerprint(message: string, stack?: string): string {
    const content = stack || message;
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    return btoa(String.fromCharCode(...data)).substring(0, 16);
  }

  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = values.sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] || 0;
  }

  private getCurrentTraceId(): string | undefined {
    // In a real implementation, this would get the current trace ID from context
    return undefined;
  }

  private getCurrentSpanId(): string | undefined {
    // In a real implementation, this would get the current span ID from context
    return undefined;
  }

  private async sendCriticalErrorAlert(error: ErrorEvent): Promise<void> {
    // In a real implementation, this would send alerts via email, Slack, PagerDuty, etc.
    console.error("CRITICAL ERROR ALERT:", {
      id: error.id,
      message: error.message,
      severity: error.severity,
      timestamp: error.timestamp,
    });
  }

  // Cleanup and maintenance
  async cleanupOldMetrics(retentionDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffISO = cutoffDate.toISOString();

    let deletedCount = 0;
    const iter = kv.list({ prefix: ["monitoring", "metrics"] });

    for await (const entry of iter) {
      const metric = entry.value as PerformanceMetric;
      if (metric.timestamp < cutoffISO) {
        await kv.delete(entry.key);
        deletedCount++;
      }
    }

    return deletedCount;
  }
}

// Middleware for automatic performance tracking
export function createAPMMiddleware() {
  const apm = APMService.getInstance();

  return async (req: Request, ctx: any) => {
    const startTime = Date.now();
    const traceId = apm.startTrace("http_request", {
      method: req.method,
      url: req.url,
    });

    try {
      const response = await ctx.next();
      const duration = Date.now() - startTime;

      await apm.recordRequestMetric(
        req.method,
        new URL(req.url).pathname,
        response.status,
        duration,
        parseInt(response.headers.get("content-length") || "0"),
        ctx.state.user?.id,
        ctx.state.user?.organizationId,
      );

      apm.finishSpan(traceId, traceId, "ok");
      await apm.finishTrace(traceId);

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;

      await apm.recordError(
        "api",
        error.message,
        error.stack,
        {
          method: req.method,
          url: req.url,
          duration,
        },
        "high",
        ctx.state.user?.id,
        ctx.state.user?.organizationId,
      );

      apm.finishSpan(traceId, traceId, "error", error.message);
      await apm.finishTrace(traceId);

      throw error;
    }
  };
}

export const apmService = APMService.getInstance();
