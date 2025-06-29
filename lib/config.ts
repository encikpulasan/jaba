// Environment Configuration
import type { EnvironmentConfig } from "@/types";

export function getConfig(): EnvironmentConfig {
  return {
    NODE_ENV: (Deno.env.get("NODE_ENV") || "development") as
      | "development"
      | "staging"
      | "production",
    PORT: parseInt(Deno.env.get("PORT") || "8000"),
    DATABASE_URL: Deno.env.get("DATABASE_URL"),
    JWT_SECRET: Deno.env.get("JWT_SECRET") ||
      "your-super-secret-jwt-key-change-in-production",
    JWT_REFRESH_SECRET: Deno.env.get("JWT_REFRESH_SECRET") ||
      "your-super-secret-refresh-key-change-in-production",
    ADMIN_EMAIL: Deno.env.get("ADMIN_EMAIL") || "admin@masma.cms",
    ADMIN_PASSWORD: Deno.env.get("ADMIN_PASSWORD") || "admin123",
    SMTP_HOST: Deno.env.get("SMTP_HOST"),
    SMTP_PORT: parseInt(Deno.env.get("SMTP_PORT") || "587"),
    SMTP_USER: Deno.env.get("SMTP_USER"),
    SMTP_PASS: Deno.env.get("SMTP_PASS"),
    UPLOAD_MAX_SIZE: parseInt(Deno.env.get("UPLOAD_MAX_SIZE") || "10485760"), // 10MB
    UPLOAD_ALLOWED_TYPES:
      (Deno.env.get("UPLOAD_ALLOWED_TYPES") ||
        "image/jpeg,image/png,image/gif,image/webp,application/pdf").split(","),
    CACHE_TTL: parseInt(Deno.env.get("CACHE_TTL") || "3600"), // 1 hour
    RATE_LIMIT_REQUESTS: parseInt(Deno.env.get("RATE_LIMIT_REQUESTS") || "100"),
    RATE_LIMIT_WINDOW: parseInt(Deno.env.get("RATE_LIMIT_WINDOW") || "900"), // 15 minutes
  };
}

export function validateConfig(config: EnvironmentConfig): void {
  const requiredFields = [
    "JWT_SECRET",
    "JWT_REFRESH_SECRET",
    "ADMIN_EMAIL",
    "ADMIN_PASSWORD",
  ];

  for (const field of requiredFields) {
    if (!config[field as keyof EnvironmentConfig]) {
      throw new Error(`Required environment variable ${field} is missing`);
    }
  }

  if (config.NODE_ENV === "production") {
    if (
      config.JWT_SECRET === "your-super-secret-jwt-key-change-in-production"
    ) {
      throw new Error("JWT_SECRET must be changed in production");
    }
    if (
      config.JWT_REFRESH_SECRET ===
        "your-super-secret-refresh-key-change-in-production"
    ) {
      throw new Error("JWT_REFRESH_SECRET must be changed in production");
    }
  }
}

export const config = getConfig();
validateConfig(config);
