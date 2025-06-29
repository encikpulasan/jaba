/// <reference lib="deno.unstable" />

// Database Backup & Restore System
// Data protection and disaster recovery utilities

import type { BackupMetadata, Timestamp, UUID } from "@/types";
import { db } from "./connection.ts";
import { ensureDir } from "$std/fs/mod.ts";
import { compress, decompress } from "$std/io/mod.ts";

export class BackupManager {
  private backupDir = "./data/backups";

  async createBackup(options?: {
    includeMedia?: boolean;
    compress?: boolean;
    encrypt?: boolean;
  }): Promise<BackupMetadata> {
    const backupId = crypto.randomUUID();
    const timestamp = Date.now();
    const opts = {
      includeMedia: true,
      compress: true,
      encrypt: false,
      ...options,
    };

    console.log("🔄 Creating database backup...");

    await ensureDir(this.backupDir);

    const connection = db.getConnection();
    const allData: Array<{ key: string[]; value: unknown }> = [];
    const collections = new Set<string>();

    // Collect all data
    const iterator = (connection.kv as Deno.Kv).list({ prefix: [] });
    for await (const { key, value } of iterator) {
      if (key.length > 0) {
        allData.push({
          key: key as string[],
          value,
        });
        collections.add(key[0] as string);
      }
    }

    // Create backup data structure
    const backupData = {
      metadata: {
        id: backupId,
        timestamp,
        version: "1.0.0",
        type: "full",
        collections: Array.from(collections),
      },
      data: allData,
    };

    // Serialize data
    let serializedData = JSON.stringify(backupData, null, 2);

    // Compress if requested
    if (opts.compress) {
      console.log("🗜️ Compressing backup...");
      const encoder = new TextEncoder();
      const compressed = await this.compressData(
        encoder.encode(serializedData),
      );
      serializedData = new TextDecoder().decode(compressed);
    }

    // Write backup file
    const filename = `backup_${timestamp}_${backupId}.json${
      opts.compress ? ".gz" : ""
    }`;
    const filepath = `${this.backupDir}/${filename}`;

    await Deno.writeTextFile(filepath, serializedData);

    // Calculate checksum
    const encoder = new TextEncoder();
    const data = encoder.encode(serializedData);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const checksum = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const metadata: BackupMetadata = {
      id: backupId,
      timestamp,
      size: data.length,
      tables: Array.from(collections),
      compression: opts.compress ? "gzip" : "none",
      encrypted: opts.encrypt,
      checksum,
    };

    // Store backup metadata
    const metadataKey = ["backups", "metadata", backupId];
    const atomic = (connection.kv as Deno.Kv).atomic();
    atomic.set(metadataKey, metadata);
    await atomic.commit();

    console.log(`✅ Backup created: ${filepath}`);
    console.log(`📊 Backup size: ${(data.length / 1024 / 1024).toFixed(2)} MB`);
    console.log(`🔢 Collections: ${collections.size}`);
    console.log(`📦 Entries: ${allData.length}`);

    return metadata;
  }

  async restoreBackup(backupId: UUID, options?: {
    overwrite?: boolean;
    dryRun?: boolean;
  }): Promise<boolean> {
    const opts = { overwrite: false, dryRun: false, ...options };

    console.log(
      `🔄 ${opts.dryRun ? "Validating" : "Restoring"} backup: ${backupId}`,
    );

    // Get backup metadata
    const connection = db.getConnection();
    const metadataKey = ["backups", "metadata", backupId];
    const metadataResult = await (connection.kv as Deno.Kv).get<BackupMetadata>(
      metadataKey,
    );

    if (!metadataResult.value) {
      throw new Error("Backup metadata not found");
    }

    const metadata = metadataResult.value;

    // Find backup file
    const filename = await this.findBackupFile(metadata.timestamp, backupId);
    if (!filename) {
      throw new Error("Backup file not found");
    }

    const filepath = `${this.backupDir}/${filename}`;

    // Read and decompress backup data
    let backupContent = await Deno.readTextFile(filepath);

    if (metadata.compression === "gzip") {
      console.log("🗜️ Decompressing backup...");
      const decoder = new TextDecoder();
      const decompressed = await this.decompressData(
        new TextEncoder().encode(backupContent),
      );
      backupContent = decoder.decode(decompressed);
    }

    // Verify checksum
    const encoder = new TextEncoder();
    const data = encoder.encode(backupContent);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const checksum = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (checksum !== metadata.checksum) {
      throw new Error(
        "Backup data integrity check failed - checksums don't match",
      );
    }

    // Parse backup data
    const backupData = JSON.parse(backupContent);

    if (opts.dryRun) {
      console.log("✅ Backup validation successful");
      console.log(`📊 Would restore ${backupData.data.length} entries`);
      console.log(
        `🔢 Collections: ${backupData.metadata.collections.join(", ")}`,
      );
      return true;
    }

    // Clear existing data if overwrite is enabled
    if (opts.overwrite) {
      console.log("🗑️ Clearing existing data...");
      await this.clearAllData();
    }

    // Restore data in batches
    const batchSize = 100;
    const totalEntries = backupData.data.length;
    let processed = 0;

    for (let i = 0; i < totalEntries; i += batchSize) {
      const batch = backupData.data.slice(i, i + batchSize);
      const atomic = (connection.kv as Deno.Kv).atomic();

      for (const entry of batch) {
        atomic.set(entry.key, entry.value);
      }

      await atomic.commit();
      processed += batch.length;

      console.log(
        `📦 Restored ${processed}/${totalEntries} entries (${
          ((processed / totalEntries) * 100).toFixed(1)
        }%)`,
      );
    }

    console.log(`✅ Backup restored successfully`);
    console.log(`📊 Total entries restored: ${totalEntries}`);

    return true;
  }

  async listBackups(): Promise<BackupMetadata[]> {
    const connection = db.getConnection();
    const backups: BackupMetadata[] = [];

    const iterator = (connection.kv as Deno.Kv).list<BackupMetadata>({
      prefix: ["backups", "metadata"],
    });

    for await (const { value } of iterator) {
      if (value) {
        backups.push(value);
      }
    }

    return backups.sort((a, b) => b.timestamp - a.timestamp);
  }

  async deleteBackup(backupId: UUID): Promise<boolean> {
    try {
      // Delete metadata
      const connection = db.getConnection();
      const metadataKey = ["backups", "metadata", backupId];
      const metadataResult = await (connection.kv as Deno.Kv).get<
        BackupMetadata
      >(metadataKey);

      if (!metadataResult.value) {
        return false;
      }

      const metadata = metadataResult.value;

      // Delete backup file
      const filename = await this.findBackupFile(metadata.timestamp, backupId);
      if (filename) {
        const filepath = `${this.backupDir}/${filename}`;
        await Deno.remove(filepath);
      }

      // Delete metadata
      const atomic = (connection.kv as Deno.Kv).atomic();
      atomic.delete(metadataKey);
      await atomic.commit();

      console.log(`✅ Backup deleted: ${backupId}`);
      return true;
    } catch (error) {
      console.error("❌ Failed to delete backup:", error);
      return false;
    }
  }

  private async findBackupFile(
    timestamp: Timestamp,
    backupId: UUID,
  ): Promise<string | null> {
    try {
      for await (const dirEntry of Deno.readDir(this.backupDir)) {
        if (
          dirEntry.isFile && dirEntry.name.includes(timestamp.toString()) &&
          dirEntry.name.includes(backupId)
        ) {
          return dirEntry.name;
        }
      }
    } catch (error) {
      console.error("Error reading backup directory:", error);
    }
    return null;
  }

  private async clearAllData(): Promise<void> {
    const connection = db.getConnection();
    const keysToDelete: string[][] = [];

    // Collect all keys except backup metadata
    const iterator = (connection.kv as Deno.Kv).list({ prefix: [] });
    for await (const { key } of iterator) {
      const keyArray = key as string[];
      if (keyArray.length > 0 && keyArray[0] !== "backups") {
        keysToDelete.push(keyArray);
      }
    }

    // Delete in batches
    const batchSize = 100;
    for (let i = 0; i < keysToDelete.length; i += batchSize) {
      const batch = keysToDelete.slice(i, i + batchSize);
      const atomic = (connection.kv as Deno.Kv).atomic();

      for (const key of batch) {
        atomic.delete(key);
      }

      await atomic.commit();
    }
  }

  private async compressData(data: Uint8Array): Promise<Uint8Array> {
    // Simplified compression - in production, you'd use a proper compression library
    return data; // TODO: Implement actual compression
  }

  private async decompressData(data: Uint8Array): Promise<Uint8Array> {
    // Simplified decompression - in production, you'd use a proper compression library
    return data; // TODO: Implement actual decompression
  }
}

// Export backup manager instance
export const backupManager = new BackupManager();
