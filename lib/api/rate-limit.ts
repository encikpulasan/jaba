// API Rate Limiting System
// Comprehensive rate limiting for REST and GraphQL APIs

import { db } from "@/lib/db/connection.ts";
import { getAuthContext } from "@/lib/auth/middleware.ts";

export interface RateLimitConfig {
  requests: number;
  window: number; // in seconds
  burst?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

// Default rate limit configurations
const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  // General API limits
  anonymous: { requests: 100, window: 3600 }, // 100 req/hour
  authenticated: { requests: 1000, window: 3600 }, // 1000 req/hour

  // API key limits (can be overridden per key)
  api_key: { requests: 5000, window: 3600 }, // 5000 req/hour

  // Specific endpoint limits
  "POST:/api/content": { requests: 100, window: 3600 },
  "POST:/api/media": { requests: 50, window: 3600 },
  "POST:/api/auth/api-keys": { requests: 10, window: 3600 },
  "POST:/api/graphql": { requests: 500, window: 3600 },

  // Mutation limits (more restrictive)
  graphql_mutation: { requests: 100, window: 3600 },
  graphql_query: { requests: 1000, window: 3600 },
};

// Get rate limit key for request
function getRateLimitKey(
  identifier: string,
  endpoint: string,
  method: string,
): string {
  return `rate_limit:${identifier}:${method}:${endpoint}`;
}

// Get rate limit configuration for request
function getRateLimitConfig(
  authContext: any,
  endpoint: string,
  method: string,
  isGraphQLMutation?: boolean,
): RateLimitConfig {
  // Check for specific endpoint limits
  const endpointKey = `${method}:${endpoint}`;
  if (DEFAULT_RATE_LIMITS[endpointKey]) {
    return DEFAULT_RATE_LIMITS[endpointKey];
  }

  // GraphQL specific limits
  if (endpoint === "/api/graphql") {
    if (isGraphQLMutation) {
      return DEFAULT_RATE_LIMITS.graphql_mutation;
    }
    return DEFAULT_RATE_LIMITS.graphql_query;
  }

  // Auth context based limits
  if (!authContext) {
    return DEFAULT_RATE_LIMITS.anonymous;
  }

  if (authContext.authType === "api_key") {
    // Use API key specific rate limit if available
    if (authContext.apiKey.rateLimit) {
      return authContext.apiKey.rateLimit;
    }
    return DEFAULT_RATE_LIMITS.api_key;
  }

  return DEFAULT_RATE_LIMITS.authenticated;
}

// Check rate limit for request
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig,
  endpoint: string,
  method: string,
): Promise<RateLimitResult> {
  const connection = db.getConnection();
  const kv = connection.kv;
  const key = getRateLimitKey(identifier, endpoint, method);
  const now = Date.now();
  const windowStart = now - (config.window * 1000);

  try {
    // Get current request count in window
    const result = await kv.get([key]);
    let requestData = result.value as
      | { count: number; resetTime: number }
      | null;

    // Initialize or reset if window expired
    if (!requestData || requestData.resetTime <= now) {
      requestData = {
        count: 0,
        resetTime: now + (config.window * 1000),
      };
    }

    // Check if limit exceeded
    if (requestData.count >= config.requests) {
      return {
        allowed: false,
        limit: config.requests,
        remaining: 0,
        resetTime: requestData.resetTime,
        retryAfter: Math.ceil((requestData.resetTime - now) / 1000),
      };
    }

    // Increment counter
    requestData.count += 1;
    await kv.set([key], requestData, {
      expireIn: config.window * 1000,
    });

    return {
      allowed: true,
      limit: config.requests,
      remaining: config.requests - requestData.count,
      resetTime: requestData.resetTime,
    };
  } catch (error) {
    console.error("Rate limit check error:", error);
    // Allow request if rate limiting fails
    return {
      allowed: true,
      limit: config.requests,
      remaining: config.requests - 1,
      resetTime: now + (config.window * 1000),
    };
  }
}

// Middleware function for rate limiting
export async function rateLimitMiddleware(
  request: Request,
  isGraphQLMutation?: boolean,
): Promise<RateLimitResult> {
  try {
    const url = new URL(request.url);
    const endpoint = url.pathname;
    const method = request.method;

    // Get authentication context
    const authContext = await getAuthContext(request);

    // Determine identifier for rate limiting
    let identifier: string;
    if (authContext) {
      if (authContext.authType === "jwt") {
        identifier = `user:${authContext.user.id}`;
      } else {
        identifier = `api_key:${authContext.apiKey.id}`;
      }
    } else {
      // Use IP address for anonymous requests
      identifier = `ip:${
        request.headers.get("X-Forwarded-For") ||
        request.headers.get("X-Real-IP") ||
        "unknown"
      }`;
    }

    // Get rate limit configuration
    const config = getRateLimitConfig(
      authContext,
      endpoint,
      method,
      isGraphQLMutation,
    );

    // Check rate limit
    return await checkRateLimit(identifier, config, endpoint, method);
  } catch (error) {
    console.error("Rate limiting middleware error:", error);
    // Allow request if middleware fails
    return {
      allowed: true,
      limit: 1000,
      remaining: 999,
      resetTime: Date.now() + 3600000, // 1 hour
    };
  }
}

// Update API key rate limit
export async function updateApiKeyRateLimit(
  apiKeyId: string,
  rateLimit: RateLimitConfig,
): Promise<void> {
  // This would update the API key's rate limit configuration
  // Implementation depends on how API keys are stored
  console.log(`Updating rate limit for API key ${apiKeyId}:`, rateLimit);
}

// Get rate limit status for identifier
export async function getRateLimitStatus(
  identifier: string,
  endpoint: string,
  method: string,
): Promise<RateLimitResult | null> {
  const connection = db.getConnection();
  const kv = connection.kv;
  const key = getRateLimitKey(identifier, endpoint, method);

  try {
    const result = await kv.get([key]);
    const requestData = result.value as
      | { count: number; resetTime: number }
      | null;

    if (!requestData) {
      return null;
    }

    const now = Date.now();
    if (requestData.resetTime <= now) {
      return null; // Window expired
    }

    return {
      allowed: requestData.count < DEFAULT_RATE_LIMITS.authenticated.requests,
      limit: DEFAULT_RATE_LIMITS.authenticated.requests,
      remaining: Math.max(
        0,
        DEFAULT_RATE_LIMITS.authenticated.requests - requestData.count,
      ),
      resetTime: requestData.resetTime,
    };
  } catch (error) {
    console.error("Get rate limit status error:", error);
    return null;
  }
}

// Clear rate limit for identifier (admin function)
export async function clearRateLimit(
  identifier: string,
  endpoint: string,
  method: string,
): Promise<boolean> {
  const connection = db.getConnection();
  const kv = connection.kv as Deno.Kv;
  const key = getRateLimitKey(identifier, endpoint, method);

  try {
    await kv.delete([key]);
    return true;
  } catch (error) {
    console.error("Clear rate limit error:", error);
    return false;
  }
}
