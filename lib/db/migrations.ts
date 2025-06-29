/// <reference lib="deno.unstable" />

// Database Migration System
// Schema versioning and data migration utilities

import type { Migration, Timestamp, UUID } from "@/types";
import { db } from "./connection.ts";
import { KeyPatterns } from "./patterns.ts";

export class MigrationManager {
  private static readonly MIGRATION_KEY = ["migrations"];
  private static readonly VERSION_KEY = ["schema_version"];

  async getCurrentVersion(): Promise<number> {
    const connection = db.getConnection();
    const result = await (connection.kv as Deno.Kv).get<number>(
      MigrationManager.VERSION_KEY,
    );
    return result.value || 0;
  }

  async setVersion(version: number): Promise<void> {
    const connection = db.getConnection();
    const atomic = (connection.kv as Deno.Kv).atomic();
    atomic.set(MigrationManager.VERSION_KEY, version);
    await atomic.commit();
  }

  async getAppliedMigrations(): Promise<Migration[]> {
    const connection = db.getConnection();
    const migrations: Migration[] = [];

    const iterator = (connection.kv as Deno.Kv).list<Migration>({
      prefix: MigrationManager.MIGRATION_KEY,
    });

    for await (const { value } of iterator) {
      if (value) {
        migrations.push(value);
      }
    }

    return migrations.sort((a, b) => a.version - b.version);
  }

  async recordMigration(migration: Migration): Promise<void> {
    const connection = db.getConnection();
    const key = [...MigrationManager.MIGRATION_KEY, migration.version];

    // Don't store functions in KV - only metadata
    const migrationRecord = {
      id: migration.id,
      name: migration.name,
      version: migration.version,
      appliedAt: Date.now(),
    };

    const atomic = (connection.kv as Deno.Kv).atomic();
    atomic.set(key, migrationRecord);
    await atomic.commit();
  }

  async removeMigration(version: number): Promise<void> {
    const connection = db.getConnection();
    const key = [...MigrationManager.MIGRATION_KEY, version];

    const atomic = (connection.kv as Deno.Kv).atomic();
    atomic.delete(key);
    await atomic.commit();
  }

  async runMigrations(migrations: Migration[]): Promise<void> {
    const currentVersion = await this.getCurrentVersion();
    const appliedMigrations = await this.getAppliedMigrations();
    const appliedVersions = new Set(appliedMigrations.map((m) => m.version));

    const pendingMigrations = migrations
      .filter((m) =>
        m.version > currentVersion && !appliedVersions.has(m.version)
      )
      .sort((a, b) => a.version - b.version);

    console.log(`🔄 Running ${pendingMigrations.length} migrations...`);

    for (const migration of pendingMigrations) {
      try {
        console.log(
          `⚡ Applying migration ${migration.version}: ${migration.name}`,
        );
        await migration.up();
        await this.recordMigration(migration);
        await this.setVersion(migration.version);
        console.log(`✅ Migration ${migration.version} completed`);
      } catch (error) {
        console.error(`❌ Migration ${migration.version} failed:`, error);
        throw error;
      }
    }

    console.log("✨ All migrations completed successfully");
  }

  async rollback(targetVersion: number): Promise<void> {
    const currentVersion = await this.getCurrentVersion();
    if (targetVersion >= currentVersion) {
      throw new Error("Target version must be less than current version");
    }

    const appliedMigrations = await this.getAppliedMigrations();
    const migrationsToRollback = appliedMigrations
      .filter((m) => m.version > targetVersion)
      .sort((a, b) => b.version - a.version); // Reverse order

    console.log(`🔄 Rolling back ${migrationsToRollback.length} migrations...`);

    for (const migration of migrationsToRollback) {
      try {
        console.log(
          `⚡ Rolling back migration ${migration.version}: ${migration.name}`,
        );
        if (migration.down) {
          await migration.down();
        }
        await this.removeMigration(migration.version);
        console.log(`✅ Migration ${migration.version} rolled back`);
      } catch (error) {
        console.error(`❌ Rollback ${migration.version} failed:`, error);
        throw error;
      }
    }

    await this.setVersion(targetVersion);
    console.log(`✨ Rollback to version ${targetVersion} completed`);
  }
}

// Default migrations for masmaCMS
export const defaultMigrations: Migration[] = [
  {
    id: "001",
    name: "Initial Schema Setup",
    version: 1,
    up: async () => {
      // Create initial system settings
      const connection = db.getConnection();
      const atomic = (connection.kv as Deno.Kv).atomic();

      // Default system settings
      atomic.set(KeyPatterns.settings.system(), {
        siteName: "masmaCMS",
        siteDescription: "Enterprise Headless CMS",
        defaultLocale: "en",
        availableLocales: ["en", "es", "fr", "de"],
        timezone: "UTC",
        dateFormat: "YYYY-MM-DD",
        timeFormat: "HH:mm:ss",
        emailFrom: "noreply@masma.cms",
        emailReplyTo: "noreply@masma.cms",
        maintenanceMode: false,
        registrationEnabled: true,
        emailVerificationRequired: true,
        twoFactorRequired: false,
        maxFileSize: 10485760, // 10MB
        allowedFileTypes: [
          "image/jpeg",
          "image/png",
          "image/gif",
          "image/webp",
          "application/pdf",
        ],
      });

      // Default locales configuration
      const locales = [
        {
          code: "en",
          name: "English",
          nativeName: "English",
          rtl: false,
          enabled: true,
          isDefault: true,
        },
        {
          code: "es",
          name: "Spanish",
          nativeName: "Español",
          rtl: false,
          enabled: true,
          isDefault: false,
        },
        {
          code: "fr",
          name: "French",
          nativeName: "Français",
          rtl: false,
          enabled: false,
          isDefault: false,
        },
        {
          code: "de",
          name: "German",
          nativeName: "Deutsch",
          rtl: false,
          enabled: false,
          isDefault: false,
        },
      ];

      for (const locale of locales) {
        atomic.set(
          [...KeyPatterns.translations.locales(), locale.code],
          locale,
        );
      }

      await atomic.commit();
    },
    down: async () => {
      const connection = db.getConnection();
      const atomic = (connection.kv as Deno.Kv).atomic();

      atomic.delete(KeyPatterns.settings.system());

      const locales = ["en", "es", "fr", "de"];
      for (const locale of locales) {
        atomic.delete([...KeyPatterns.translations.locales(), locale]);
      }

      await atomic.commit();
    },
  },
  {
    id: "002",
    name: "Content Schema Setup",
    version: 2,
    up: async () => {
      const connection = db.getConnection();
      const atomic = (connection.kv as Deno.Kv).atomic();

      // Default content schemas
      const defaultSchemas = [
        {
          id: "page",
          name: "Page",
          description: "Basic page content type",
          fields: [
            {
              id: "title",
              name: "Title",
              type: "text",
              required: true,
              multilingual: true,
            },
            {
              id: "content",
              name: "Content",
              type: "markdown",
              required: true,
              multilingual: true,
            },
            {
              id: "featured_image",
              name: "Featured Image",
              type: "image",
              required: false,
              multilingual: false,
            },
          ],
          isSystem: true,
        },
        {
          id: "post",
          name: "Blog Post",
          description: "Blog post content type",
          fields: [
            {
              id: "title",
              name: "Title",
              type: "text",
              required: true,
              multilingual: true,
            },
            {
              id: "content",
              name: "Content",
              type: "markdown",
              required: true,
              multilingual: true,
            },
            {
              id: "excerpt",
              name: "Excerpt",
              type: "textarea",
              required: false,
              multilingual: true,
            },
            {
              id: "featured_image",
              name: "Featured Image",
              type: "image",
              required: false,
              multilingual: false,
            },
            {
              id: "publish_date",
              name: "Publish Date",
              type: "datetime",
              required: true,
              multilingual: false,
            },
          ],
          isSystem: true,
        },
      ];

      for (const schema of defaultSchemas) {
        atomic.set(KeyPatterns.schemas.byId(schema.id), schema);
        atomic.set(KeyPatterns.schemas.byName(schema.name), schema.id);
      }

      await atomic.commit();
    },
    down: async () => {
      const connection = db.getConnection();
      const atomic = (connection.kv as Deno.Kv).atomic();

      const schemaIds = ["page", "post"];
      for (const id of schemaIds) {
        atomic.delete(KeyPatterns.schemas.byId(id));
      }

      const schemaNames = ["Page", "Blog Post"];
      for (const name of schemaNames) {
        atomic.delete(KeyPatterns.schemas.byName(name));
      }

      await atomic.commit();
    },
  },
];

// Export migration manager instance
export const migrationManager = new MigrationManager();
