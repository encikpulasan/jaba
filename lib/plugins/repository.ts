// Plugin Repository
// Data access layer for plugin management

import { db } from "@/lib/db/connection.ts";
import { DbPatterns } from "@/lib/db/patterns.ts";
import type {
  Plugin,
  PluginManifest,
  PluginStatus,
  HookRegistration,
  PluginEvent,
} from "@/types/plugin.ts";
import type { UUID } from "@/types/base.ts";

export class PluginRepository {
  private get kv(): Deno.Kv {
    return db.getConnection().kv as Deno.Kv;
  }

  // Plugin Management
  async createPlugin(plugin: Omit<Plugin, "id" | "createdAt" | "updatedAt">): Promise<Plugin> {
    const id = crypto.randomUUID();
    const now = Date.now();
    
    const fullPlugin: Plugin = {
      ...plugin,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.kv.set(DbPatterns.plugins.byId(id), fullPlugin);
    
    console.log(`✅ Created plugin: ${plugin.manifestId}`);
    return fullPlugin;
  }

  async getPlugin(id: UUID): Promise<Plugin | null> {
    const result = await this.kv.get(DbPatterns.plugins.byId(id));
    return result.value as Plugin | null;
  }

  async updatePlugin(id: UUID, updates: Partial<Plugin>): Promise<Plugin | null> {
    const existing = await this.getPlugin(id);
    if (!existing) return null;

    const updated: Plugin = {
      ...existing,
      ...updates,
      id,
      updatedAt: Date.now(),
    };

    await this.kv.set(DbPatterns.plugins.byId(id), updated);
    return updated;
  }

  async listPlugins(): Promise<Plugin[]> {
    const plugins: Plugin[] = [];
    const iterator = this.kv.list({ prefix: ["plugin"] });
    
    for await (const entry of iterator) {
      if (entry.key.length === 2) { // Direct plugin entries
        plugins.push(entry.value as Plugin);
      }
    }
    
    return plugins.sort((a, b) => b.createdAt - a.createdAt);
  }

  // Plugin Manifest Management
  async storeManifest(manifest: PluginManifest): Promise<void> {
    await this.kv.set(DbPatterns.plugins.manifest(manifest.id), manifest);
    console.log(`✅ Stored plugin manifest: ${manifest.name}`);
  }

  async getManifest(id: string): Promise<PluginManifest | null> {
    const result = await this.kv.get(DbPatterns.plugins.manifest(id));
    return result.value as PluginManifest | null;
  }
}
