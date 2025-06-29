// Performance API Routes
// Endpoints for performance monitoring and analytics

import { Handlers } from "$fresh/server.ts";
import { performanceMonitor } from "@/lib/performance/monitoring.ts";
import { cache } from "@/lib/cache/multi-layer.ts";

export const handler: Handlers = {
  async GET(req) {
    const url = new URL(req.url);
    const endpoint = url.searchParams.get("endpoint");

    switch (endpoint) {
      case "health":
        return Response.json(performanceMonitor.getHealthStatus());

      case "metrics":
        const timeRange = {
          start: parseInt(url.searchParams.get("start") || "0") ||
            (Date.now() - 3600000), // 1 hour ago
          end: parseInt(url.searchParams.get("end") || "0") || Date.now(),
        };
        const metrics = performanceMonitor.getMetrics(undefined, timeRange);
        return Response.json(metrics);

      case "analytics":
        const analyticsTimeRange = {
          start: parseInt(url.searchParams.get("start") || "0") ||
            (Date.now() - 3600000),
          end: parseInt(url.searchParams.get("end") || "0") || Date.now(),
        };
        const analytics = performanceMonitor.getPerformanceAnalytics(
          analyticsTimeRange,
        );
        return Response.json(analytics);

      case "alerts":
        const resolved = url.searchParams.get("resolved") === "true";
        const alerts = performanceMonitor.getAlerts(resolved);
        return Response.json(alerts);

      case "cache":
        const cacheInfo = cache.getCacheInfo();
        return Response.json(cacheInfo);

      default:
        return Response.json(
          {
            error:
              "Invalid endpoint. Use: health, metrics, analytics, alerts, cache",
          },
          { status: 400 },
        );
    }
  },

  async POST(req) {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "resolve_alert":
        const { alertId } = body;
        if (!alertId) {
          return Response.json({ error: "Alert ID required" }, { status: 400 });
        }
        performanceMonitor.resolveAlert(alertId);
        return Response.json({ success: true });

      case "clear_cache":
        await cache.clear();
        return Response.json({ success: true });

      case "warmup_cache":
        const { keys } = body;
        if (!keys || !Array.isArray(keys)) {
          return Response.json({ error: "Keys array required" }, {
            status: 400,
          });
        }
        // Implement cache warmup logic here
        return Response.json({ success: true });

      default:
        return Response.json(
          {
            error:
              "Invalid action. Use: resolve_alert, clear_cache, warmup_cache",
          },
          { status: 400 },
        );
    }
  },
};
