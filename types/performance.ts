// Performance Monitoring Type Definitions
// Types for performance optimization and monitoring

import type { UUID, BaseEntity } from "./base.ts";

// Performance Metrics Types
export type PerformanceMetricType = 
  | "response_time" 
  | "memory_usage" 
  | "cpu_usage" 
  | "cache_hit_rate"
  | "api_latency"
  | "error_rate";

export type PerformanceLevel = "excellent" | "good" | "fair" | "poor" | "critical";
export type AlertSeverity = "info" | "warning" | "error" | "critical";

// Performance Metric Entity
export interface PerformanceMetric extends BaseEntity {
  type: PerformanceMetricType;
  value: number;
  unit: string;
  timestamp: Date;
  source: string;
  level: PerformanceLevel;
  organizationId?: UUID;
}

// Performance Alert System
export interface PerformanceAlert extends BaseEntity {
  type: PerformanceMetricType;
  severity: AlertSeverity;
  title: string;
  message: string;
  value: number;
  threshold: number;
  source: string;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
  organizationId?: UUID;
}

// Caching System Types
export interface CacheMetrics extends BaseEntity {
  hitRate: number; // percentage
  missRate: number; // percentage
  memoryUsage: number; // MB
  totalRequests: number;
  totalHits: number;
  totalMisses: number;
  averageResponseTime: number; // milliseconds
  timestamp: Date;
}

// System Resource Monitoring
export interface SystemResourceMetrics extends BaseEntity {
  cpu: {
    usage: number; // percentage
    cores: number;
  };
  memory: {
    total: number; // bytes
    used: number; // bytes
    usage: number; // percentage
  };
  disk: {
    total: number; // bytes
    used: number; // bytes
    usage: number; // percentage
  };
  timestamp: Date;
}

// Performance Dashboard
export interface PerformanceDashboard {
  overview: {
    status: PerformanceLevel;
    score: number; // 0-100
    uptime: number; // percentage
    lastUpdated: Date;
  };
  realTimeMetrics: {
    activeUsers: number;
    requestsPerSecond: number;
    averageResponseTime: number;
    errorRate: number;
    cacheHitRate: number;
  };
  systemHealth: {
    cpu: number; // percentage
    memory: number; // percentage
    disk: number; // percentage
  };
  alerts: {
    active: number;
    critical: number;
    warnings: number;
  };
}
