// Database Types
import type { Timestamp, UUID } from "./base.ts";

export interface KVKey {
  prefix: string;
  parts: (string | number)[];
}

export interface KVEntry<T = unknown> {
  key: KVKey;
  value: T;
  versionstamp: string;
}

export interface DatabaseConnection {
  kv: unknown; // Deno KV instance
  isConnected: boolean;
  lastPing?: Timestamp;
}

export interface Migration {
  id: string;
  name: string;
  version: number;
  up: () => Promise<void>;
  down: () => Promise<void>;
  appliedAt?: Timestamp;
}

export interface BackupMetadata {
  id: UUID;
  timestamp: Timestamp;
  size: number;
  tables: string[];
  compression: "gzip" | "none";
  encrypted: boolean;
  checksum: string;
}

export interface DatabaseStats {
  totalEntries: number;
  totalSize: number;
  collections: Array<{
    name: string;
    count: number;
    size: number;
  }>;
  lastBackup?: Timestamp;
  lastMaintenance?: Timestamp;
}

export interface QueryOptions {
  limit?: number;
  offset?: number;
  reverse?: boolean;
  consistency?: "strong" | "eventual";
}

export interface TransactionResult {
  ok: boolean;
  versionstamp?: string;
  error?: string;
}
