#!/usr/bin/env -S deno run -A

// Database Migration Script
// Command-line utility for managing database migrations

import { db, defaultMigrations, migrationManager } from "@/lib/db/mod.ts";
import { parseArgs } from "$std/cli/parse_args.ts";
import * as colors from "colors";

async function main() {
  const args = parseArgs(Deno.args, {
    boolean: ["help", "status", "reset"],
    string: ["rollback"],
    default: { help: false, status: false, reset: false },
  });

  if (args.help) {
    showHelp();
    return;
  }

  try {
    // Connect to database
    await db.connect();

    if (args.status) {
      await showStatus();
    } else if (args.reset) {
      await resetDatabase();
    } else if (args.rollback) {
      const targetVersion = parseInt(args.rollback);
      if (isNaN(targetVersion)) {
        console.error(colors.red("❌ Invalid rollback version"));
        Deno.exit(1);
      }
      await rollback(targetVersion);
    } else {
      await runMigrations();
    }
  } catch (error) {
    console.error(colors.red("❌ Migration failed:"), error.message);
    Deno.exit(1);
  } finally {
    await db.disconnect();
  }
}

async function showStatus() {
  console.log(colors.bold("📊 Migration Status"));
  console.log("==================\n");

  const currentVersion = await migrationManager.getCurrentVersion();
  const appliedMigrations = await migrationManager.getAppliedMigrations();

  console.log(
    `Current schema version: ${colors.cyan(currentVersion.toString())}`,
  );
  console.log(
    `Applied migrations: ${
      colors.green(appliedMigrations.length.toString())
    }\n`,
  );

  if (appliedMigrations.length > 0) {
    console.log("Applied migrations:");
    for (const migration of appliedMigrations) {
      const appliedDate = migration.appliedAt
        ? new Date(migration.appliedAt).toISOString()
        : "Unknown";
      console.log(
        `  ${
          colors.green("✓")
        } ${migration.version} - ${migration.name} (${appliedDate})`,
      );
    }
  }

  const pendingMigrations = defaultMigrations.filter(
    (m) => m.version > currentVersion,
  );

  if (pendingMigrations.length > 0) {
    console.log(`\nPending migrations (${pendingMigrations.length}):`);
    for (const migration of pendingMigrations) {
      console.log(
        `  ${colors.yellow("○")} ${migration.version} - ${migration.name}`,
      );
    }
  } else {
    console.log(colors.green("\n✅ Database is up to date"));
  }
}

async function runMigrations() {
  console.log(colors.bold("🔄 Running Migrations"));
  console.log("====================\n");

  await migrationManager.runMigrations(defaultMigrations);
}

async function rollback(targetVersion: number) {
  console.log(colors.bold(`🔄 Rolling Back to Version ${targetVersion}`));
  console.log("=======================================\n");

  const currentVersion = await migrationManager.getCurrentVersion();
  if (targetVersion >= currentVersion) {
    console.log(
      colors.yellow("⚠️ Target version is same or higher than current version"),
    );
    return;
  }

  console.log(
    colors.yellow("⚠️ WARNING: This will rollback database changes!"),
  );
  console.log("Press Ctrl+C to cancel or any key to continue...");

  // Wait for user input
  const decoder = new TextDecoder();
  const buffer = new Uint8Array(1024);
  await Deno.stdin.read(buffer);

  await migrationManager.rollback(targetVersion);
}

async function resetDatabase() {
  console.log(colors.bold("🔄 Resetting Database"));
  console.log("=====================\n");

  console.log(colors.red("⚠️ WARNING: This will delete ALL data!"));
  console.log("Press Ctrl+C to cancel or any key to continue...");

  // Wait for user input
  const decoder = new TextDecoder();
  const buffer = new Uint8Array(1024);
  await Deno.stdin.read(buffer);

  // Rollback to version 0 (empty database)
  await migrationManager.rollback(0);

  // Run all migrations from scratch
  await migrationManager.runMigrations(defaultMigrations);

  console.log(colors.green("✅ Database reset completed"));
}

function showHelp() {
  console.log(colors.bold("masmaCMS Database Migration Tool"));
  console.log("=================================\n");
  console.log("Usage: deno task migrate [options]\n");
  console.log("Options:");
  console.log("  --help              Show this help message");
  console.log("  --status            Show migration status");
  console.log("  --rollback <n>      Rollback to version n");
  console.log("  --reset             Reset database (rollback + migrate)");
  console.log("\nExamples:");
  console.log("  deno task migrate                 # Run pending migrations");
  console.log("  deno task migrate --status        # Show migration status");
  console.log("  deno task migrate --rollback 1    # Rollback to version 1");
  console.log("  deno task migrate --reset         # Reset database");
}

if (import.meta.main) {
  await main();
}
