import { kv } from "../db/connection.ts";

export interface AnalyticsEvent {
  id: string;
  timestamp: string;
  type:
    | "page_view"
    | "user_action"
    | "api_call"
    | "content_interaction"
    | "system_event";
  category: string;
  action: string;
  label?: string;
  value?: number;
  userId?: string;
  sessionId: string;
  organizationId?: string;
  properties: Record<string, unknown>;
  metadata: {
    userAgent?: string;
    ipAddress?: string;
    referrer?: string;
    country?: string;
    device?: string;
    browser?: string;
    os?: string;
  };
}

export interface DashboardMetric {
  id: string;
  name: string;
  type: "counter" | "gauge" | "histogram" | "rate";
  value: number;
  previousValue?: number;
  change?: number;
  changePercent?: number;
  trend: "up" | "down" | "stable";
  timestamp: string;
  period: "hour" | "day" | "week" | "month";
  organizationId?: string;
}

export interface UsageReport {
  id: string;
  organizationId?: string;
  period: {
    start: string;
    end: string;
    type: "daily" | "weekly" | "monthly" | "quarterly";
  };
  metrics: {
    activeUsers: number;
    totalSessions: number;
    avgSessionDuration: number;
    pageViews: number;
    apiCalls: number;
    contentCreated: number;
    contentPublished: number;
    mediaUploaded: number;
    storageUsed: number;
    bandwidthUsed: number;
  };
  growth: {
    users: number;
    sessions: number;
    content: number;
    engagement: number;
  };
  topPages: Array<{
    path: string;
    views: number;
    uniqueViews: number;
  }>;
  topContent: Array<{
    id: string;
    title: string;
    views: number;
    engagement: number;
  }>;
  userSegments: Array<{
    segment: string;
    users: number;
    sessions: number;
    avgDuration: number;
  }>;
}

export interface AlertRule {
  id: string;
  name: string;
  metric: string;
  condition:
    | "greater_than"
    | "less_than"
    | "equals"
    | "not_equals"
    | "contains";
  threshold: number;
  period: number; // minutes
  organizationId?: string;
  isActive: boolean;
  notifications: {
    email?: string[];
    webhook?: string;
    slack?: string;
  };
  createdAt: string;
  lastTriggered?: string;
  triggerCount: number;
}

export class AnalyticsService {
  private static instance: AnalyticsService;
  private eventBuffer: AnalyticsEvent[] = [];
  private flushInterval = 5000; // 5 seconds
  private bufferSize = 500;

  public static getInstance(): AnalyticsService {
    if (!AnalyticsService.instance) {
      AnalyticsService.instance = new AnalyticsService();
    }
    return AnalyticsService.instance;
  }

  constructor() {
    this.startPeriodicFlush();
    this.startMetricsCalculation();
  }

  // Event Tracking
  async trackEvent(
    type: AnalyticsEvent["type"],
    category: string,
    action: string,
    label?: string,
    value?: number,
    userId?: string,
    sessionId?: string,
    organizationId?: string,
    properties: Record<string, unknown> = {},
    metadata: AnalyticsEvent["metadata"] = {},
  ): Promise<void> {
    const event: AnalyticsEvent = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type,
      category,
      action,
      label,
      value,
      userId,
      sessionId: sessionId || crypto.randomUUID(),
      organizationId,
      properties,
      metadata,
    };

    this.eventBuffer.push(event);

    if (this.eventBuffer.length >= this.bufferSize) {
      await this.flushEvents();
    }
  }

  async trackPageView(
    path: string,
    title: string,
    userId?: string,
    sessionId?: string,
    organizationId?: string,
    metadata: AnalyticsEvent["metadata"] = {},
  ): Promise<void> {
    await this.trackEvent(
      "page_view",
      "navigation",
      "page_view",
      path,
      1,
      userId,
      sessionId,
      organizationId,
      { path, title },
      metadata,
    );
  }

  async trackUserAction(
    action: string,
    category: string,
    label?: string,
    value?: number,
    userId?: string,
    sessionId?: string,
    organizationId?: string,
    properties: Record<string, unknown> = {},
  ): Promise<void> {
    await this.trackEvent(
      "user_action",
      category,
      action,
      label,
      value,
      userId,
      sessionId,
      organizationId,
      properties,
    );
  }

  async trackContentInteraction(
    contentId: string,
    interaction: "view" | "like" | "share" | "comment" | "download",
    userId?: string,
    sessionId?: string,
    organizationId?: string,
    properties: Record<string, unknown> = {},
  ): Promise<void> {
    await this.trackEvent(
      "content_interaction",
      "content",
      interaction,
      contentId,
      1,
      userId,
      sessionId,
      organizationId,
      { contentId, ...properties },
    );
  }

  // Dashboard Metrics
  async getDashboardMetrics(
    organizationId?: string,
    period: DashboardMetric["period"] = "day",
  ): Promise<DashboardMetric[]> {
    const metrics: DashboardMetric[] = [];
    const now = new Date();
    const periodStart = this.getPeriodStart(now, period);
    const previousPeriodStart = this.getPreviousPeriodStart(
      periodStart,
      period,
    );

    const currentPeriodEvents = await this.getEvents(
      periodStart.toISOString(),
      now.toISOString(),
      organizationId,
    );
    const previousPeriodEvents = await this.getEvents(
      previousPeriodStart.toISOString(),
      periodStart.toISOString(),
      organizationId,
    );

    // Active Users
    const activeUsers =
      new Set(currentPeriodEvents.filter((e) => e.userId).map((e) => e.userId))
        .size;
    const previousActiveUsers =
      new Set(previousPeriodEvents.filter((e) => e.userId).map((e) => e.userId))
        .size;

    metrics.push({
      id: "active_users",
      name: "Active Users",
      type: "gauge",
      value: activeUsers,
      previousValue: previousActiveUsers,
      change: activeUsers - previousActiveUsers,
      changePercent: previousActiveUsers > 0
        ? ((activeUsers - previousActiveUsers) / previousActiveUsers) * 100
        : 0,
      trend: activeUsers > previousActiveUsers
        ? "up"
        : activeUsers < previousActiveUsers
        ? "down"
        : "stable",
      timestamp: now.toISOString(),
      period,
      organizationId,
    });

    // Total Sessions
    const totalSessions =
      new Set(currentPeriodEvents.map((e) => e.sessionId)).size;
    const previousTotalSessions =
      new Set(previousPeriodEvents.map((e) => e.sessionId)).size;

    metrics.push({
      id: "total_sessions",
      name: "Total Sessions",
      type: "counter",
      value: totalSessions,
      previousValue: previousTotalSessions,
      change: totalSessions - previousTotalSessions,
      changePercent: previousTotalSessions > 0
        ? ((totalSessions - previousTotalSessions) / previousTotalSessions) *
          100
        : 0,
      trend: totalSessions > previousTotalSessions
        ? "up"
        : totalSessions < previousTotalSessions
        ? "down"
        : "stable",
      timestamp: now.toISOString(),
      period,
      organizationId,
    });

    // Page Views
    const pageViews =
      currentPeriodEvents.filter((e) => e.type === "page_view").length;
    const previousPageViews =
      previousPeriodEvents.filter((e) => e.type === "page_view").length;

    metrics.push({
      id: "page_views",
      name: "Page Views",
      type: "counter",
      value: pageViews,
      previousValue: previousPageViews,
      change: pageViews - previousPageViews,
      changePercent: previousPageViews > 0
        ? ((pageViews - previousPageViews) / previousPageViews) * 100
        : 0,
      trend: pageViews > previousPageViews
        ? "up"
        : pageViews < previousPageViews
        ? "down"
        : "stable",
      timestamp: now.toISOString(),
      period,
      organizationId,
    });

    // API Calls
    const apiCalls =
      currentPeriodEvents.filter((e) => e.type === "api_call").length;
    const previousApiCalls =
      previousPeriodEvents.filter((e) => e.type === "api_call").length;

    metrics.push({
      id: "api_calls",
      name: "API Calls",
      type: "counter",
      value: apiCalls,
      previousValue: previousApiCalls,
      change: apiCalls - previousApiCalls,
      changePercent: previousApiCalls > 0
        ? ((apiCalls - previousApiCalls) / previousApiCalls) * 100
        : 0,
      trend: apiCalls > previousApiCalls
        ? "up"
        : apiCalls < previousApiCalls
        ? "down"
        : "stable",
      timestamp: now.toISOString(),
      period,
      organizationId,
    });

    return metrics;
  }

  // Usage Reports
  async generateUsageReport(
    periodType: UsageReport["period"]["type"],
    organizationId?: string,
  ): Promise<UsageReport> {
    const now = new Date();
    const { start, end } = this.getReportPeriod(now, periodType);
    const { start: prevStart, end: prevEnd } = this.getPreviousReportPeriod(
      start,
      periodType,
    );

    const events = await this.getEvents(start, end, organizationId);
    const previousEvents = await this.getEvents(
      prevStart,
      prevEnd,
      organizationId,
    );

    // Calculate metrics
    const activeUsers =
      new Set(events.filter((e) => e.userId).map((e) => e.userId)).size;
    const previousActiveUsers =
      new Set(previousEvents.filter((e) => e.userId).map((e) => e.userId)).size;

    const totalSessions = new Set(events.map((e) => e.sessionId)).size;
    const previousTotalSessions =
      new Set(previousEvents.map((e) => e.sessionId)).size;

    const pageViews = events.filter((e) => e.type === "page_view").length;
    const apiCalls = events.filter((e) => e.type === "api_call").length;

    // Session duration calculation
    const sessionDurations = this.calculateSessionDurations(events);
    const avgSessionDuration = sessionDurations.length > 0
      ? sessionDurations.reduce((sum, duration) => sum + duration, 0) /
        sessionDurations.length
      : 0;

    // Top pages
    const pageViewEvents = events.filter((e) => e.type === "page_view");
    const pageCounts = new Map<
      string,
      { views: number; uniqueViews: Set<string> }
    >();

    pageViewEvents.forEach((event) => {
      const path = event.properties.path as string;
      if (!pageCounts.has(path)) {
        pageCounts.set(path, { views: 0, uniqueViews: new Set() });
      }
      const pageData = pageCounts.get(path)!;
      pageData.views++;
      if (event.userId) {
        pageData.uniqueViews.add(event.userId);
      }
    });

    const topPages = Array.from(pageCounts.entries())
      .map(([path, data]) => ({
        path,
        views: data.views,
        uniqueViews: data.uniqueViews.size,
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);

    // Content interactions
    const contentInteractions = events.filter((e) =>
      e.type === "content_interaction"
    );
    const contentCounts = new Map<
      string,
      { views: number; engagement: number }
    >();

    contentInteractions.forEach((event) => {
      const contentId = event.properties.contentId as string;
      if (!contentCounts.has(contentId)) {
        contentCounts.set(contentId, { views: 0, engagement: 0 });
      }
      const contentData = contentCounts.get(contentId)!;
      if (event.action === "view") {
        contentData.views++;
      }
      contentData.engagement++;
    });

    const topContent = Array.from(contentCounts.entries())
      .map(([id, data]) => ({
        id,
        title: `Content ${id}`, // Would fetch actual title from content service
        views: data.views,
        engagement: data.engagement,
      }))
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 10);

    const report: UsageReport = {
      id: crypto.randomUUID(),
      organizationId,
      period: {
        start,
        end,
        type: periodType,
      },
      metrics: {
        activeUsers,
        totalSessions,
        avgSessionDuration: Math.round(avgSessionDuration),
        pageViews,
        apiCalls,
        contentCreated: 0, // Would be calculated from content events
        contentPublished: 0, // Would be calculated from content events
        mediaUploaded: 0, // Would be calculated from media events
        storageUsed: 0, // Would be calculated from storage metrics
        bandwidthUsed: 0, // Would be calculated from bandwidth metrics
      },
      growth: {
        users: previousActiveUsers > 0
          ? ((activeUsers - previousActiveUsers) / previousActiveUsers) * 100
          : 0,
        sessions: previousTotalSessions > 0
          ? ((totalSessions - previousTotalSessions) / previousTotalSessions) *
            100
          : 0,
        content: 0, // Would be calculated
        engagement: 0, // Would be calculated
      },
      topPages,
      topContent,
      userSegments: [], // Would be calculated based on user behavior
    };

    // Store the report
    await kv.set(["analytics", "reports", report.id], report);

    if (organizationId) {
      await kv.set([
        "analytics",
        "reports",
        "by_org",
        organizationId,
        report.id,
      ], report.id);
    }

    return report;
  }

  // Real-time Analytics
  async getRealTimeMetrics(
    organizationId?: string,
  ): Promise<Record<string, unknown>> {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    const recentEvents = await this.getEvents(
      fiveMinutesAgo.toISOString(),
      now.toISOString(),
      organizationId,
    );

    const activeUsers =
      new Set(recentEvents.filter((e) => e.userId).map((e) => e.userId)).size;
    const activeSessions = new Set(recentEvents.map((e) => e.sessionId)).size;
    const pageViews = recentEvents.filter((e) => e.type === "page_view").length;
    const userActions =
      recentEvents.filter((e) => e.type === "user_action").length;

    return {
      timestamp: now.toISOString(),
      activeUsers,
      activeSessions,
      pageViews,
      userActions,
      totalEvents: recentEvents.length,
    };
  }

  // Alert Management
  async createAlertRule(
    name: string,
    metric: string,
    condition: AlertRule["condition"],
    threshold: number,
    period: number,
    organizationId?: string,
    notifications: AlertRule["notifications"] = {},
  ): Promise<string> {
    const rule: AlertRule = {
      id: crypto.randomUUID(),
      name,
      metric,
      condition,
      threshold,
      period,
      organizationId,
      isActive: true,
      notifications,
      createdAt: new Date().toISOString(),
      triggerCount: 0,
    };

    await kv.set(["analytics", "alert_rules", rule.id], rule);

    if (organizationId) {
      await kv.set([
        "analytics",
        "alert_rules",
        "by_org",
        organizationId,
        rule.id,
      ], rule.id);
    }

    return rule.id;
  }

  async checkAlerts(): Promise<void> {
    const iter = kv.list({ prefix: ["analytics", "alert_rules"] });

    for await (const entry of iter) {
      const rule = entry.value as AlertRule;
      if (!rule.isActive) continue;

      const shouldTrigger = await this.evaluateAlertRule(rule);
      if (shouldTrigger) {
        await this.triggerAlert(rule);
      }
    }
  }

  private async evaluateAlertRule(rule: AlertRule): Promise<boolean> {
    const now = new Date();
    const periodStart = new Date(now.getTime() - rule.period * 60 * 1000);

    const events = await this.getEvents(
      periodStart.toISOString(),
      now.toISOString(),
      rule.organizationId,
    );

    let currentValue: number;

    switch (rule.metric) {
      case "active_users":
        currentValue =
          new Set(events.filter((e) => e.userId).map((e) => e.userId)).size;
        break;
      case "error_rate":
        const totalRequests =
          events.filter((e) => e.type === "api_call").length;
        const errors =
          events.filter((e) => e.type === "api_call" && e.properties.error)
            .length;
        currentValue = totalRequests > 0 ? (errors / totalRequests) * 100 : 0;
        break;
      case "response_time":
        const requestEvents = events.filter((e) =>
          e.type === "api_call" && e.value
        );
        currentValue = requestEvents.length > 0
          ? requestEvents.reduce((sum, e) => sum + (e.value || 0), 0) /
            requestEvents.length
          : 0;
        break;
      default:
        return false;
    }

    switch (rule.condition) {
      case "greater_than":
        return currentValue > rule.threshold;
      case "less_than":
        return currentValue < rule.threshold;
      case "equals":
        return currentValue === rule.threshold;
      case "not_equals":
        return currentValue !== rule.threshold;
      default:
        return false;
    }
  }

  private async triggerAlert(rule: AlertRule): Promise<void> {
    rule.lastTriggered = new Date().toISOString();
    rule.triggerCount++;

    await kv.set(["analytics", "alert_rules", rule.id], rule);

    // Send notifications
    console.warn("ALERT TRIGGERED:", {
      rule: rule.name,
      metric: rule.metric,
      condition: rule.condition,
      threshold: rule.threshold,
      triggeredAt: rule.lastTriggered,
    });

    // In a real implementation, this would send actual notifications
    // via email, Slack, webhooks, etc.
  }

  // Utility Methods
  private async flushEvents(): Promise<void> {
    if (this.eventBuffer.length === 0) return;

    const eventsToFlush = [...this.eventBuffer];
    this.eventBuffer = [];

    for (const event of eventsToFlush) {
      await kv.set(["analytics", "events", event.id], event);

      if (event.organizationId) {
        await kv.set([
          "analytics",
          "events",
          "by_org",
          event.organizationId,
          event.id,
        ], event.id);
      }

      // Create time-series indexes
      const day = event.timestamp.split("T")[0];
      await kv.set(["analytics", "events", "by_day", day, event.id], event.id);

      if (event.userId) {
        await kv.set(
          ["analytics", "events", "by_user", event.userId, event.id],
          event.id,
        );
      }
    }
  }

  private startPeriodicFlush(): void {
    setInterval(async () => {
      await this.flushEvents();
    }, this.flushInterval);
  }

  private startMetricsCalculation(): void {
    // Calculate dashboard metrics every 5 minutes
    setInterval(async () => {
      try {
        await this.calculateAndStoreDashboardMetrics();
        await this.checkAlerts();
      } catch (error) {
        console.error("Error calculating metrics:", error);
      }
    }, 5 * 60 * 1000);
  }

  private async calculateAndStoreDashboardMetrics(): Promise<void> {
    // Calculate metrics for all organizations
    const orgIter = kv.list({ prefix: ["organizations"] });

    for await (const entry of orgIter) {
      const org = entry.value as any;
      const metrics = await this.getDashboardMetrics(org.id);

      for (const metric of metrics) {
        await kv.set(
          ["analytics", "dashboard_metrics", org.id, metric.id],
          metric,
        );
      }
    }

    // Calculate global metrics
    const globalMetrics = await this.getDashboardMetrics();
    for (const metric of globalMetrics) {
      await kv.set(
        ["analytics", "dashboard_metrics", "global", metric.id],
        metric,
      );
    }
  }

  private async getEvents(
    startTime: string,
    endTime: string,
    organizationId?: string,
  ): Promise<AnalyticsEvent[]> {
    const events: AnalyticsEvent[] = [];
    let prefix = ["analytics", "events"];

    if (organizationId) {
      prefix = ["analytics", "events", "by_org", organizationId];
    }

    const iter = kv.list({ prefix });

    for await (const entry of iter) {
      let event: AnalyticsEvent;
      if (organizationId) {
        const eventResult = await kv.get(["analytics", "events", entry.value]);
        if (!eventResult.value) continue;
        event = eventResult.value as AnalyticsEvent;
      } else {
        event = entry.value as AnalyticsEvent;
      }

      if (event.timestamp >= startTime && event.timestamp <= endTime) {
        events.push(event);
      }
    }

    return events;
  }

  private calculateSessionDurations(events: AnalyticsEvent[]): number[] {
    const sessionMap = new Map<string, { start: number; end: number }>();

    events.forEach((event) => {
      const timestamp = new Date(event.timestamp).getTime();
      const session = sessionMap.get(event.sessionId);

      if (!session) {
        sessionMap.set(event.sessionId, { start: timestamp, end: timestamp });
      } else {
        session.end = Math.max(session.end, timestamp);
      }
    });

    return Array.from(sessionMap.values()).map((session) =>
      session.end - session.start
    );
  }

  private getPeriodStart(date: Date, period: DashboardMetric["period"]): Date {
    const start = new Date(date);

    switch (period) {
      case "hour":
        start.setMinutes(0, 0, 0);
        break;
      case "day":
        start.setHours(0, 0, 0, 0);
        break;
      case "week":
        start.setDate(start.getDate() - start.getDay());
        start.setHours(0, 0, 0, 0);
        break;
      case "month":
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        break;
    }

    return start;
  }

  private getPreviousPeriodStart(
    periodStart: Date,
    period: DashboardMetric["period"],
  ): Date {
    const prev = new Date(periodStart);

    switch (period) {
      case "hour":
        prev.setHours(prev.getHours() - 1);
        break;
      case "day":
        prev.setDate(prev.getDate() - 1);
        break;
      case "week":
        prev.setDate(prev.getDate() - 7);
        break;
      case "month":
        prev.setMonth(prev.getMonth() - 1);
        break;
    }

    return prev;
  }

  private getReportPeriod(
    date: Date,
    type: UsageReport["period"]["type"],
  ): { start: string; end: string } {
    const end = new Date(date);
    const start = new Date(date);

    switch (type) {
      case "daily":
        start.setDate(start.getDate() - 1);
        break;
      case "weekly":
        start.setDate(start.getDate() - 7);
        break;
      case "monthly":
        start.setMonth(start.getMonth() - 1);
        break;
      case "quarterly":
        start.setMonth(start.getMonth() - 3);
        break;
    }

    return {
      start: start.toISOString(),
      end: end.toISOString(),
    };
  }

  private getPreviousReportPeriod(
    periodStart: string,
    type: UsageReport["period"]["type"],
  ): { start: string; end: string } {
    const end = new Date(periodStart);
    const start = new Date(periodStart);

    switch (type) {
      case "daily":
        start.setDate(start.getDate() - 1);
        break;
      case "weekly":
        start.setDate(start.getDate() - 7);
        break;
      case "monthly":
        start.setMonth(start.getMonth() - 1);
        break;
      case "quarterly":
        start.setMonth(start.getMonth() - 3);
        break;
    }

    return {
      start: start.toISOString(),
      end: end.toISOString(),
    };
  }
}

export const analyticsService = AnalyticsService.getInstance();
