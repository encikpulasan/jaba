// Performance API Route
// Real-time performance monitoring and analytics endpoint

import { Handlers } from "$fresh/server.ts";
import { performanceMonitor } from "@/lib/performance/monitoring.ts";
import RBACManager from "@/lib/auth/rbac.ts";
import {
  getAuthContext,
  getUserId,
  hasPermission,
} from "@/lib/auth/middleware.ts";
import type { PerformanceMetricType } from "@/types/performance.ts";

export const handler: Handlers = {
  // GET /api/performance - Get performance dashboard
  async GET(req) {
    try {
      // Extract auth context
      const authContext = getAuthContext(req);
      if (!authContext) {
        return new Response(
          JSON.stringify({ error: "Authentication required" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }

      // Check permissions
      const hasViewPermission = hasPermission(authContext, "view_audit_logs");

      if (!hasViewPermission) {
        return new Response(
          JSON.stringify({ error: "Insufficient permissions" }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        );
      }

      const url = new URL(req.url);
      const action = url.searchParams.get("action");

      switch (action) {
        case "dashboard":
          return await handleDashboard();

        case "metrics":
          return await handleMetrics(url);

        case "alerts":
          return await handleAlerts(url);

        case "start":
          return await handleStartMonitoring();

        case "stop":
          return await handleStopMonitoring();

        default:
          return await handleDashboard();
      }
    } catch (error) {
      console.error("Performance API error:", error);
      return new Response(
        JSON.stringify({
          error: "Internal server error",
          details: error instanceof Error ? error.message : "Unknown error",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  },

  // POST /api/performance - Record custom metrics
  async POST(req) {
    try {
      // Extract auth context
      const authContext = getAuthContext(req);
      if (!authContext) {
        return new Response(
          JSON.stringify({ error: "Authentication required" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }

      // Check permissions
      const hasManagePermission = hasPermission(
        authContext,
        "edit_system_settings",
      );

      if (!hasManagePermission) {
        return new Response(
          JSON.stringify({ error: "Insufficient permissions" }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        );
      }

      const body = await req.json();
      const { type, value, unit, source, organizationId } = body;

      if (!type || value === undefined || !unit || !source) {
        return new Response(
          JSON.stringify({
            error: "Missing required fields: type, value, unit, source",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      // Record the custom metric
      await performanceMonitor.recordMetric(
        type as PerformanceMetricType,
        value,
        unit,
        source,
        organizationId,
      );

      return new Response(
        JSON.stringify({
          success: true,
          message: "Metric recorded successfully",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    } catch (error) {
      console.error("Performance metric recording error:", error);
      return new Response(
        JSON.stringify({
          error: "Failed to record metric",
          details: error instanceof Error ? error.message : "Unknown error",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  },
};

// Handle dashboard request
async function handleDashboard() {
  const dashboard = await performanceMonitor.getDashboard();

  return new Response(
    JSON.stringify({
      success: true,
      data: dashboard,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    },
  );
}

// Handle metrics request
async function handleMetrics(url: URL) {
  const type = url.searchParams.get("type") as PerformanceMetricType;
  const limit = parseInt(url.searchParams.get("limit") || "100");
  const timeWindow = parseInt(url.searchParams.get("timeWindow") || "3600000"); // 1 hour default

  if (type) {
    const metrics = await performanceMonitor.getMetricsByType(type, limit);
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          type,
          metrics,
          total: metrics.length,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      },
    );
  } else {
    // Get recent metrics across all types
    const recentMetrics = await performanceMonitor.getRecentMetrics(timeWindow);
    const metricsData = Object.fromEntries(recentMetrics);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          timeWindow,
          metrics: metricsData,
          totalTypes: recentMetrics.size,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      },
    );
  }
}

// Handle alerts request
async function handleAlerts(url: URL) {
  const activeOnly = url.searchParams.get("active") === "true";
  const limit = parseInt(url.searchParams.get("limit") || "50");

  const alerts = activeOnly
    ? await performanceMonitor.getActiveAlerts()
    : await performanceMonitor.getAllAlerts(limit);

  return new Response(
    JSON.stringify({
      success: true,
      data: {
        alerts,
        total: alerts.length,
        activeOnly,
      },
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    },
  );
}

// Handle start monitoring
async function handleStartMonitoring() {
  await performanceMonitor.startMonitoring();

  return new Response(
    JSON.stringify({
      success: true,
      message: "Performance monitoring started",
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

// Handle stop monitoring
async function handleStopMonitoring() {
  performanceMonitor.stopMonitoring();

  return new Response(
    JSON.stringify({
      success: true,
      message: "Performance monitoring stopped",
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}
