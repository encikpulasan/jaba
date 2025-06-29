import { kv } from "../db/connection.ts";

export interface AuditEvent {
  id: string;
  timestamp: string;
  eventType: AuditEventType;
  userId?: string;
  userEmail?: string;
  ipAddress: string;
  userAgent: string;
  resource: string;
  action: string;
  details: Record<string, unknown>;
  severity: "low" | "medium" | "high" | "critical";
  category: "authentication" | "authorization" | "data" | "system" | "security";
  success: boolean;
  errorMessage?: string;
  sessionId?: string;
  organizationId?: string;
  complianceFlags: string[];
}

export type AuditEventType =
  | "user_login"
  | "user_logout"
  | "user_registration"
  | "password_change"
  | "role_assigned"
  | "permission_granted"
  | "permission_denied"
  | "content_created"
  | "content_updated"
  | "content_deleted"
  | "content_published"
  | "media_uploaded"
  | "media_deleted"
  | "media_accessed"
  | "api_key_created"
  | "api_key_used"
  | "api_key_revoked"
  | "data_exported"
  | "data_imported"
  | "data_anonymized"
  | "data_deleted"
  | "security_scan"
  | "vulnerability_detected"
  | "suspicious_activity"
  | "system_config_changed"
  | "backup_created"
  | "backup_restored"
  | "gdpr_request"
  | "gdpr_fulfillment"
  | "consent_given"
  | "consent_withdrawn";

export interface AuditQuery {
  startDate?: string;
  endDate?: string;
  userId?: string;
  eventType?: AuditEventType;
  category?: string;
  severity?: string;
  organizationId?: string;
  limit?: number;
  offset?: number;
}

export interface ComplianceReport {
  id: string;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  organizationId?: string;
  reportType: "gdpr" | "security" | "access" | "data_retention";
  summary: {
    totalEvents: number;
    criticalEvents: number;
    securityIncidents: number;
    gdprRequests: number;
    dataBreaches: number;
  };
  events: AuditEvent[];
  recommendations: string[];
  complianceScore: number;
}

export class AuditLogger {
  private static instance: AuditLogger;

  public static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger();
    }
    return AuditLogger.instance;
  }

  async logEvent(event: Omit<AuditEvent, "id" | "timestamp">): Promise<void> {
    const auditEvent: AuditEvent = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...event,
    };

    // Store in KV with multiple indexes for efficient querying
    const key = ["audit", "events", auditEvent.id];
    await kv.set(key, auditEvent);

    // Create indexes for efficient querying
    await this.createIndexes(auditEvent);

    // Check for critical events and trigger alerts
    if (auditEvent.severity === "critical") {
      await this.handleCriticalEvent(auditEvent);
    }

    // Update real-time metrics
    await this.updateMetrics(auditEvent);
  }

  private async createIndexes(event: AuditEvent): Promise<void> {
    const date = event.timestamp.split("T")[0]; // YYYY-MM-DD

    // Date-based index
    await kv.set(["audit", "by_date", date, event.id], event.id);

    // User-based index
    if (event.userId) {
      await kv.set(["audit", "by_user", event.userId, event.id], event.id);
    }

    // Event type index
    await kv.set(["audit", "by_type", event.eventType, event.id], event.id);

    // Category index
    await kv.set(["audit", "by_category", event.category, event.id], event.id);

    // Severity index
    await kv.set(["audit", "by_severity", event.severity, event.id], event.id);

    // Organization index
    if (event.organizationId) {
      await kv.set(
        ["audit", "by_org", event.organizationId, event.id],
        event.id,
      );
    }
  }

  async queryEvents(query: AuditQuery): Promise<AuditEvent[]> {
    const events: AuditEvent[] = [];
    let prefix: string[];

    // Determine the most efficient index to use
    if (query.userId) {
      prefix = ["audit", "by_user", query.userId];
    } else if (query.eventType) {
      prefix = ["audit", "by_type", query.eventType];
    } else if (query.category) {
      prefix = ["audit", "by_category", query.category];
    } else if (query.organizationId) {
      prefix = ["audit", "by_org", query.organizationId];
    } else {
      prefix = ["audit", "events"];
    }

    const iter = kv.list({ prefix });
    let count = 0;
    const offset = query.offset || 0;
    const limit = query.limit || 100;

    for await (const entry of iter) {
      if (count >= offset + limit) break;

      let event: AuditEvent;
      if (prefix[0] === "audit" && prefix[1] === "events") {
        event = entry.value as AuditEvent;
      } else {
        // Get the actual event from the ID
        const eventResult = await kv.get(["audit", "events", entry.value]);
        if (!eventResult.value) continue;
        event = eventResult.value as AuditEvent;
      }

      // Apply filters
      if (query.startDate && event.timestamp < query.startDate) continue;
      if (query.endDate && event.timestamp > query.endDate) continue;
      if (query.severity && event.severity !== query.severity) continue;

      if (count >= offset) {
        events.push(event);
      }
      count++;
    }

    return events;
  }

  async generateComplianceReport(
    reportType: ComplianceReport["reportType"],
    startDate: string,
    endDate: string,
    organizationId?: string,
  ): Promise<ComplianceReport> {
    const events = await this.queryEvents({
      startDate,
      endDate,
      organizationId,
      limit: 10000, // Large limit for comprehensive reporting
    });

    const summary = {
      totalEvents: events.length,
      criticalEvents: events.filter((e) => e.severity === "critical").length,
      securityIncidents:
        events.filter((e) => e.category === "security" && !e.success).length,
      gdprRequests:
        events.filter((e) => e.eventType.startsWith("gdpr_")).length,
      dataBreaches:
        events.filter((e) =>
          e.eventType === "vulnerability_detected" && e.severity === "critical"
        ).length,
    };

    const recommendations = this.generateRecommendations(events, summary);
    const complianceScore = this.calculateComplianceScore(
      summary,
      events.length,
    );

    const report: ComplianceReport = {
      id: crypto.randomUUID(),
      generatedAt: new Date().toISOString(),
      periodStart: startDate,
      periodEnd: endDate,
      organizationId,
      reportType,
      summary,
      events: events.slice(0, 1000), // Limit events in report
      recommendations,
      complianceScore,
    };

    // Store the report
    await kv.set(["audit", "reports", report.id], report);

    return report;
  }

  private generateRecommendations(
    events: AuditEvent[],
    summary: any,
  ): string[] {
    const recommendations: string[] = [];

    if (summary.criticalEvents > 0) {
      recommendations.push(
        "Review and address all critical security events immediately",
      );
    }

    if (summary.securityIncidents > 10) {
      recommendations.push(
        "Implement additional security monitoring and access controls",
      );
    }

    const failedLogins =
      events.filter((e) => e.eventType === "user_login" && !e.success).length;

    if (failedLogins > 50) {
      recommendations.push(
        "Consider implementing account lockout and rate limiting",
      );
    }

    const uniqueIPs = new Set(events.map((e) => e.ipAddress)).size;
    if (uniqueIPs > 100) {
      recommendations.push(
        "Monitor for unusual access patterns and consider IP allowlisting",
      );
    }

    if (summary.gdprRequests > 0) {
      recommendations.push(
        "Ensure all GDPR requests are fulfilled within required timeframes",
      );
    }

    return recommendations;
  }

  private calculateComplianceScore(summary: any, totalEvents: number): number {
    let score = 100;

    // Deduct points for security issues
    score -= Math.min(summary.criticalEvents * 10, 50);
    score -= Math.min(summary.securityIncidents * 5, 30);
    score -= Math.min(summary.dataBreaches * 20, 60);

    // Bonus points for good practices
    if (totalEvents > 1000 && summary.criticalEvents === 0) {
      score += 5; // Active monitoring with no critical issues
    }

    return Math.max(0, Math.min(100, score));
  }

  private async handleCriticalEvent(event: AuditEvent): Promise<void> {
    // Store critical event separately for immediate attention
    await kv.set(["audit", "critical", event.id], event);

    // Could integrate with alerting system here
    console.error("CRITICAL AUDIT EVENT:", event);
  }

  private async updateMetrics(event: AuditEvent): Promise<void> {
    const today = new Date().toISOString().split("T")[0];

    // Update daily metrics
    const dailyKey = ["audit", "metrics", "daily", today];
    const dailyMetrics = await kv.get(dailyKey);
    const currentMetrics = dailyMetrics.value as any || {
      totalEvents: 0,
      criticalEvents: 0,
      securityEvents: 0,
      successfulLogins: 0,
      failedLogins: 0,
    };

    currentMetrics.totalEvents++;
    if (event.severity === "critical") currentMetrics.criticalEvents++;
    if (event.category === "security") currentMetrics.securityEvents++;
    if (event.eventType === "user_login" && event.success) {
      currentMetrics.successfulLogins++;
    }
    if (event.eventType === "user_login" && !event.success) {
      currentMetrics.failedLogins++;
    }

    await kv.set(dailyKey, currentMetrics);
  }

  async getMetrics(date: string): Promise<any> {
    const result = await kv.get(["audit", "metrics", "daily", date]);
    return result.value || {
      totalEvents: 0,
      criticalEvents: 0,
      securityEvents: 0,
      successfulLogins: 0,
      failedLogins: 0,
    };
  }

  async searchEvents(
    searchTerm: string,
    category?: string,
    limit: number = 50,
  ): Promise<AuditEvent[]> {
    const events: AuditEvent[] = [];
    const prefix = category
      ? ["audit", "by_category", category]
      : ["audit", "events"];

    const iter = kv.list({ prefix });
    let count = 0;

    for await (const entry of iter) {
      if (count >= limit) break;

      let event: AuditEvent;
      if (prefix[0] === "audit" && prefix[1] === "events") {
        event = entry.value as AuditEvent;
      } else {
        const eventResult = await kv.get(["audit", "events", entry.value]);
        if (!eventResult.value) continue;
        event = eventResult.value as AuditEvent;
      }

      // Simple text search in event details
      const searchableText = JSON.stringify(event).toLowerCase();
      if (searchableText.includes(searchTerm.toLowerCase())) {
        events.push(event);
        count++;
      }
    }

    return events;
  }

  async cleanupOldEvents(retentionDays: number = 365): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffISO = cutoffDate.toISOString();

    let deletedCount = 0;
    const iter = kv.list({ prefix: ["audit", "events"] });

    for await (const entry of iter) {
      const event = entry.value as AuditEvent;
      if (event.timestamp < cutoffISO) {
        await kv.delete(entry.key);
        // Also cleanup indexes
        await this.cleanupEventIndexes(event);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  private async cleanupEventIndexes(event: AuditEvent): Promise<void> {
    const date = event.timestamp.split("T")[0];

    await kv.delete(["audit", "by_date", date, event.id]);
    if (event.userId) {
      await kv.delete(["audit", "by_user", event.userId, event.id]);
    }
    await kv.delete(["audit", "by_type", event.eventType, event.id]);
    await kv.delete(["audit", "by_category", event.category, event.id]);
    await kv.delete(["audit", "by_severity", event.severity, event.id]);
    if (event.organizationId) {
      await kv.delete(["audit", "by_org", event.organizationId, event.id]);
    }
  }
}

// Helper functions for common audit events
export const auditLogger = AuditLogger.getInstance();

export function createAuditMiddleware() {
  return async (req: Request, ctx: any) => {
    const startTime = Date.now();

    try {
      const response = await ctx.next();

      // Log successful API access
      await auditLogger.logEvent({
        eventType: "api_key_used",
        userId: ctx.state.user?.id,
        userEmail: ctx.state.user?.email,
        ipAddress: req.headers.get("x-forwarded-for") || "unknown",
        userAgent: req.headers.get("user-agent") || "unknown",
        resource: new URL(req.url).pathname,
        action: req.method,
        details: {
          responseTime: Date.now() - startTime,
          statusCode: response.status,
        },
        severity: "low",
        category: "system",
        success: response.status < 400,
        sessionId: ctx.state.sessionId,
        organizationId: ctx.state.user?.organizationId,
        complianceFlags: [],
      });

      return response;
    } catch (error) {
      // Log failed API access
      await auditLogger.logEvent({
        eventType: "suspicious_activity",
        userId: ctx.state.user?.id,
        userEmail: ctx.state.user?.email,
        ipAddress: req.headers.get("x-forwarded-for") || "unknown",
        userAgent: req.headers.get("user-agent") || "unknown",
        resource: new URL(req.url).pathname,
        action: req.method,
        details: {
          error: error.message,
          responseTime: Date.now() - startTime,
        },
        severity: "high",
        category: "security",
        success: false,
        errorMessage: error.message,
        sessionId: ctx.state.sessionId,
        organizationId: ctx.state.user?.organizationId,
        complianceFlags: ["error"],
      });

      throw error;
    }
  };
}
