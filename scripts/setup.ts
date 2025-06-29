#!/usr/bin/env -S deno run -A

// masmaCMS Setup Script
// Initial project setup utility

import { ensureDir, exists } from "$std/fs/mod.ts";
import * as colors from "colors";

async function setupDirectories() {
  console.log(colors.blue("📁 Setting up directories..."));

  const dirs = [
    "data/content",
    "data/media/uploads",
    "data/backups",
    "data/logs",
    "static/uploads",
  ];

  for (const dir of dirs) {
    await ensureDir(dir);
    console.log(colors.green(`  ✓ Created ${dir}`));
  }
}

async function setupEnvFile() {
  console.log(colors.blue("⚙️  Setting up environment file..."));

  if (!(await exists(".env"))) {
    await Deno.copyFile(".env.example", ".env");
    console.log(colors.green("  ✓ Created .env from .env.example"));
    console.log(
      colors.yellow("  ⚠️  Please update .env with your configuration"),
    );
  } else {
    console.log(colors.yellow("  ⚠️  .env already exists, skipping"));
  }
}

async function main() {
  console.log(colors.bold("🚀 masmaCMS Setup"));
  console.log("=================\n");

  try {
    await setupDirectories();
    await setupEnvFile();

    console.log(colors.green("\n✨ Setup completed successfully!"));
    console.log(colors.blue("\nNext steps:"));
    console.log("  1. Update .env with your configuration");
    console.log("  2. Run 'deno task start' to start development server");
  } catch (error) {
    console.error(
      colors.red("❌ Setup failed:"),
      error instanceof Error ? error.message : String(error),
    );
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
