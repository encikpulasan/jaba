// Database Module
// Main exports for masmaCMS database functionality

export * from "./connection.ts";
export * from "./patterns.ts";
export * from "./migrations.ts";
export * from "./backup.ts";
export * from "./repositories/base.ts";

// Re-export commonly used functions
export { db, ensureConnection, withTransaction } from "./connection.ts";
export { KeyBuilder, KeyPatterns } from "./patterns.ts";
export { defaultMigrations, migrationManager } from "./migrations.ts";
export { backupManager } from "./backup.ts";
