// Load Testing Utilities
// Performance validation and stress testing tools

import { performanceMonitor } from "@/lib/performance/monitoring.ts";

export interface LoadTestConfig {
  name: string;
  url: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
  concurrent: number;
  duration: number; // seconds
  rampUp?: number; // seconds to reach full load
  expectedResponseTime?: number;
  expectedSuccessRate?: number;
}

export interface LoadTestResult {
  testName: string;
  duration: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  requestsPerSecond: number;
  successRate: number;
  errorsByType: Map<string, number>;
  responseTimePercentiles: {
    p50: number;
    p95: number;
    p99: number;
  };
}

class LoadTester {
  private static instance: LoadTester;
  private activeTests: Map<string, boolean>;

  private constructor() {
    this.activeTests = new Map();
  }

  static getInstance(): LoadTester {
    if (!LoadTester.instance) {
      LoadTester.instance = new LoadTester();
    }
    return LoadTester.instance;
  }

  async runLoadTest(config: LoadTestConfig): Promise<LoadTestResult> {
    console.log(`🚀 Starting load test: ${config.name}`);
    console.log(`📊 Config: ${config.concurrent} concurrent users for ${config.duration}s`);

    this.activeTests.set(config.name, true);
    
    const results: Array<{
      success: boolean;
      responseTime: number;
      error?: string;
    }> = [];

    const startTime = Date.now();
    const endTime = startTime + (config.duration * 1000);
    
    try {
      // Ramp up phase
      if (config.rampUp) {
        await this.rampUpLoad(config, results, endTime);
      } else {
        await this.fullLoad(config, results, endTime);
      }

      const totalTime = Date.now() - startTime;
      
      console.log(`✅ Load test completed: ${config.name}`);
      
      return this.analyzeResults(config.name, results, totalTime);
    } catch (error) {
      console.error(`❌ Load test error: ${error}`);
      throw error;
    } finally {
      this.activeTests.delete(config.name);
    }
  }

  async runStepLoadTest(configs: LoadTestConfig[]): Promise<LoadTestResult[]> {
    const results: LoadTestResult[] = [];
    
    for (const config of configs) {
      console.log(`🔄 Running step ${configs.indexOf(config) + 1}/${configs.length}`);
      const result = await this.runLoadTest(config);
      results.push(result);
      
      // Brief pause between steps
      await this.sleep(2000);
    }
    
    return results;
  }

  // Spike testing - sudden load increase
  async runSpikeTest(baseConfig: LoadTestConfig, spikeMultiplier: number): Promise<{
    baseline: LoadTestResult;
    spike: LoadTestResult;
  }> {
    console.log(`⚡ Starting spike test with ${spikeMultiplier}x multiplier`);
    
    // Run baseline test
    const baseline = await this.runLoadTest(baseConfig);
    
    // Brief pause
    await this.sleep(5000);
    
    // Run spike test
    const spikeConfig: LoadTestConfig = {
      ...baseConfig,
      name: `${baseConfig.name}_spike`,
      concurrent: baseConfig.concurrent * spikeMultiplier,
      duration: Math.min(baseConfig.duration, 60), // Limit spike duration
    };
    
    const spike = await this.runLoadTest(spikeConfig);
    
    return { baseline, spike };
  }

  // Endurance testing - sustained load
  async runEnduranceTest(config: LoadTestConfig, hours: number): Promise<LoadTestResult[]> {
    console.log(`🏃 Starting endurance test for ${hours} hours`);
    
    const results: LoadTestResult[] = [];
    const testInterval = 15 * 60; // 15 minutes per test
    const testsPerHour = 60 * 60 / testInterval; // 4 tests per hour
    const totalTests = Math.ceil(hours * testsPerHour);
    
    for (let i = 0; i < totalTests; i++) {
      console.log(`🔄 Endurance test ${i + 1}/${totalTests}`);
      
      const testConfig: LoadTestConfig = {
        ...config,
        name: `${config.name}_endurance_${i + 1}`,
        duration: testInterval,
      };
      
      const result = await this.runLoadTest(testConfig);
      results.push(result);
      
      // Check if test should continue
      if (!this.activeTests.has(`endurance_${config.name}`)) {
        console.log("🛑 Endurance test stopped by user");
        break;
      }
    }
    
    return results;
  }

  stopTest(testName: string): void {
    this.activeTests.set(testName, false);
    console.log(`🛑 Stopping test: ${testName}`);
  }

  // Generate test reports
  generateReport(results: LoadTestResult[]): string {
    let report = "# Load Test Report\n\n";
    
    results.forEach((result, index) => {
      report += `## Test ${index + 1}: ${result.testName}\n`;
      report += `- **Duration**: ${result.duration}ms\n`;
      report += `- **Total Requests**: ${result.totalRequests}\n`;
      report += `- **Success Rate**: ${result.successRate.toFixed(2)}%\n`;
      report += `- **Average Response Time**: ${result.averageResponseTime.toFixed(2)}ms\n`;
      report += `- **Requests/Second**: ${result.requestsPerSecond.toFixed(2)}\n`;
      report += `- **Response Time Percentiles**:\n`;
      report += `  - P50: ${result.responseTimePercentiles.p50.toFixed(2)}ms\n`;
      report += `  - P95: ${result.responseTimePercentiles.p95.toFixed(2)}ms\n`;
      report += `  - P99: ${result.responseTimePercentiles.p99.toFixed(2)}ms\n`;
      
      if (result.errorsByType.size > 0) {
        report += `- **Errors**:\n`;
        for (const [error, count] of result.errorsByType.entries()) {
          report += `  - ${error}: ${count}\n`;
        }
      }
      
      report += "\n";
    });
    
    return report;
  }

  // Performance comparison
  compareResults(baseline: LoadTestResult, comparison: LoadTestResult): {
    responseTimeChange: number;
    throughputChange: number;
    errorRateChange: number;
    recommendation: string;
  } {
    const responseTimeChange = ((comparison.averageResponseTime - baseline.averageResponseTime) / baseline.averageResponseTime) * 100;
    const throughputChange = ((comparison.requestsPerSecond - baseline.requestsPerSecond) / baseline.requestsPerSecond) * 100;
    const errorRateChange = (100 - comparison.successRate) - (100 - baseline.successRate);
    
    let recommendation = "Performance is stable.";
    
    if (responseTimeChange > 20) {
      recommendation = "⚠️ Response time degraded significantly. Investigate performance bottlenecks.";
    } else if (throughputChange < -10) {
      recommendation = "⚠️ Throughput decreased. Check for resource constraints.";
    } else if (errorRateChange > 2) {
      recommendation = "⚠️ Error rate increased. Review error logs and system stability.";
    } else if (responseTimeChange < -10 && throughputChange > 10) {
      recommendation = "✅ Performance improved! Consider this as a baseline.";
    }
    
    return {
      responseTimeChange,
      throughputChange,
      errorRateChange,
      recommendation,
    };
  }

  // Private helper methods
  private async rampUpLoad(
    config: LoadTestConfig,
    results: Array<{ success: boolean; responseTime: number; error?: string }>,
    endTime: number
  ): Promise<void> {
    const rampUpTime = config.rampUp! * 1000;
    const startTime = Date.now();
    const rampUpEnd = startTime + rampUpTime;
    
    // Gradually increase load
    while (Date.now() < endTime && this.activeTests.get(config.name)) {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / rampUpTime, 1);
      const currentConcurrency = Math.floor(config.concurrent * progress);
      
      if (currentConcurrency > 0) {
        const batch = Array(currentConcurrency).fill(null).map(() => 
          this.executeRequest(config)
        );
        
        const batchResults = await Promise.all(batch);
        results.push(...batchResults);
      }
      
      await this.sleep(1000); // Wait 1 second between batches
    }
  }

  private async fullLoad(
    config: LoadTestConfig,
    results: Array<{ success: boolean; responseTime: number; error?: string }>,
    endTime: number
  ): Promise<void> {
    const promises: Promise<void>[] = [];
    
    // Start concurrent workers
    for (let i = 0; i < config.concurrent; i++) {
      promises.push(this.worker(config, results, endTime));
    }
    
    await Promise.all(promises);
  }

  private async worker(
    config: LoadTestConfig,
    results: Array<{ success: boolean; responseTime: number; error?: string }>,
    endTime: number
  ): Promise<void> {
    while (Date.now() < endTime && this.activeTests.get(config.name)) {
      const result = await this.executeRequest(config);
      results.push(result);
      
      // Small delay to prevent overwhelming the server
      await this.sleep(Math.random() * 100);
    }
  }

  private async executeRequest(config: LoadTestConfig): Promise<{
    success: boolean;
    responseTime: number;
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      const response = await fetch(config.url, {
        method: config.method,
        headers: config.headers,
        body: config.body,
      });
      
      const responseTime = Date.now() - startTime;
      
      return {
        success: response.ok,
        responseTime,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        success: false,
        responseTime,
        error: error.message,
      };
    }
  }

  private analyzeResults(
    testName: string,
    results: Array<{ success: boolean; responseTime: number; error?: string }>,
    totalTime: number
  ): LoadTestResult {
    const successfulRequests = results.filter(r => r.success).length;
    const failedRequests = results.length - successfulRequests;
    
    const responseTimes = results.map(r => r.responseTime).sort((a, b) => a - b);
    const averageResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
    
    const errorsByType = new Map<string, number>();
    results.filter(r => !r.success).forEach(r => {
      const error = r.error || "Unknown error";
      errorsByType.set(error, (errorsByType.get(error) || 0) + 1);
    });
    
    return {
      testName,
      duration: totalTime,
      totalRequests: results.length,
      successfulRequests,
      failedRequests,
      averageResponseTime,
      minResponseTime: responseTimes[0] || 0,
      maxResponseTime: responseTimes[responseTimes.length - 1] || 0,
      requestsPerSecond: (results.length / totalTime) * 1000,
      successRate: (successfulRequests / results.length) * 100,
      errorsByType,
      responseTimePercentiles: {
        p50: responseTimes[Math.floor(responseTimes.length * 0.5)] || 0,
        p95: responseTimes[Math.floor(responseTimes.length * 0.95)] || 0,
        p99: responseTimes[Math.floor(responseTimes.length * 0.99)] || 0,
      },
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const loadTester = LoadTester.getInstance();

// Predefined test configurations
export const TestConfigs = {
  lightLoad: (baseUrl: string): LoadTestConfig => ({
    name: "Light Load Test",
    url: `${baseUrl}/api/content`,
    method: "GET",
    concurrent: 5,
    duration: 60,
    expectedResponseTime: 500,
    expectedSuccessRate: 99,
  }),

  normalLoad: (baseUrl: string): LoadTestConfig => ({
    name: "Normal Load Test",
    url: `${baseUrl}/api/content`,
    method: "GET",
    concurrent: 20,
    duration: 300,
    rampUp: 60,
    expectedResponseTime: 1000,
    expectedSuccessRate: 98,
  }),

  heavyLoad: (baseUrl: string): LoadTestConfig => ({
    name: "Heavy Load Test",
    url: `${baseUrl}/api/content`,
    method: "GET",
    concurrent: 100,
    duration: 600,
    rampUp: 120,
    expectedResponseTime: 2000,
    expectedSuccessRate: 95,
  }),

  apiStress: (baseUrl: string): LoadTestConfig => ({
    name: "API Stress Test",
    url: `${baseUrl}/api/graphql`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: "query { content { id title } }",
    }),
    concurrent: 50,
    duration: 300,
    expectedResponseTime: 1500,
    expectedSuccessRate: 97,
  }),
}; 