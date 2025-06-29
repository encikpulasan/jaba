// masmaCMS Performance Monitoring Demo
// Demonstration of comprehensive performance optimization and monitoring

import { performanceMonitor } from "@/lib/performance/monitoring.ts";
import { UserRepository } from "@/lib/auth/repositories/user.ts";

async function demonstratePerformanceMonitoring() {
  console.log("========================================");
  console.log("🚀 PERFORMANCE MONITORING DEMO");
  console.log("========================================");

  // 1. Start Performance Monitoring
  console.log("\n🔍 Starting Performance Monitoring...");
  await performanceMonitor.startMonitoring();

  // Wait a moment for initial metrics collection
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 2. Record Custom Metrics
  console.log("\n📊 Recording Custom Performance Metrics...");
  
  // Simulate various performance metrics
  const customMetrics = [
    {
      type: "response_time",
      value: 250,
      unit: "milliseconds",
      source: "api_endpoints"
    },
    {
      type: "memory_usage", 
      value: 75,
      unit: "percentage",
      source: "system_monitor"
    },
    {
      type: "api_latency",
      value: 150,
      unit: "milliseconds", 
      source: "content_api"
    },
    {
      type: "cache_hit_rate",
      value: 92,
      unit: "percentage",
      source: "multi_layer_cache"
    }
  ];

  for (const metric of customMetrics) {
    await performanceMonitor.recordMetric(
      metric.type as any,
      metric.value,
      metric.unit,
      metric.source
    );
    console.log(`  ✅ Recorded ${metric.type}: ${metric.value}${metric.unit}`);
  }

  // 3. Get Performance Dashboard
  console.log("\n📈 Performance Dashboard Overview...");
  
  const dashboard = await performanceMonitor.getDashboard();
  console.log("  📊 System Status:");
  console.log(`     Overall Status: ${dashboard.overview.status.toUpperCase()}`);
  console.log(`     Performance Score: ${dashboard.overview.score}/100`);
  console.log(`     System Uptime: ${dashboard.overview.uptime}%`);

  console.log("\n  🔥 Real-time Metrics:");
  console.log(`     Active Users: ${dashboard.realTimeMetrics.activeUsers}`);
  console.log(`     Requests/Second: ${dashboard.realTimeMetrics.requestsPerSecond}`);
  console.log(`     Avg Response Time: ${dashboard.realTimeMetrics.averageResponseTime.toFixed(2)}ms`);
  console.log(`     Cache Hit Rate: ${dashboard.realTimeMetrics.cacheHitRate.toFixed(2)}%`);

  // 4. Performance Monitoring Features
  console.log("\n🔧 Performance Monitoring Features:");
  
  const features = [
    "Real-time Performance Metrics Collection",
    "Automated Performance Alerts & Notifications", 
    "System Resource Monitoring (CPU, Memory, Disk)",
    "API Response Time Tracking",
    "Cache Performance Analysis",
    "Custom Metric Recording & Analysis",
    "Performance Dashboard & Reporting"
  ];

  features.forEach(feature => {
    console.log(`  ✅ ${feature}`);
  });

  // 5. Stop Monitoring
  console.log("\n⏹️ Stopping Performance Monitoring...");
  performanceMonitor.stopMonitoring();

  console.log("\n✨ PERFORMANCE MONITORING DEMO COMPLETED");
  console.log("🎯 The system provides comprehensive performance monitoring");
  console.log("   with real-time metrics, alerting, and optimization insights.");
}

// Run the demo
if (import.meta.main) {
  await demonstratePerformanceMonitoring();
}
