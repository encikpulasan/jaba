// Plugin Service
// Business logic layer for plugin management

import { PluginRepository } from "./repository.ts";
import { AuthService } from "@/lib/auth/service.ts";
import type {
  Plugin,
  PluginManifest,
  PluginStatus,
  PluginInstallResult,
  PluginContext,
} from "@/types/plugin.ts";
import type { UUID } from "@/types/base.ts";
import type { User } from "@/types/user.ts";

export class PluginService {
  private repository: PluginRepository;
  private authService: AuthService;
  private loadedPlugins: Map<string, any> = new Map();

  constructor() {
    this.repository = new PluginRepository();
    this.authService = new AuthService();
  }

  // Plugin Installation
  async installPlugin(
    manifest: PluginManifest,
    user: User,
    organizationId?: UUID
  ): Promise<PluginInstallResult> {
    try {
      // Check permissions
      if (!await this.authService.hasPermission(user.id, "install_plugins")) {
        return {
          success: false,
          error: "Insufficient permissions to install plugins",
        };
      }

      // Store manifest
      await this.repository.storeManifest(manifest);

      // Create plugin instance
      const plugin = await this.repository.createPlugin({
        manifestId: manifest.id,
        organizationId,
        userId: user.id,
        status: "inactive",
        version: manifest.version,
        config: {},
        settings: {
          enabled: false,
          autoUpdate: true,
          priority: 100,
          environment: "production",
          debugMode: false,
          logLevel: "info",
        },
        stats: {
          timesLoaded: 0,
          timesExecuted: 0,
          averageExecutionTime: 0,
          memoryUsage: 0,
          errors: 0,
          warnings: 0,
        },
        errorCount: 0,
      });

      console.log(`✅ Plugin installed: ${manifest.name}`);

      return {
        success: true,
        plugin,
      };
    } catch (error) {
      console.error("❌ Plugin installation failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // Plugin Management
  async enablePlugin(pluginId: UUID, user: User): Promise<boolean> {
    try {
      const plugin = await this.repository.getPlugin(pluginId);
      if (!plugin) return false;

      await this.repository.updatePlugin(pluginId, {
        status: "active",
        settings: {
          ...plugin.settings,
          enabled: true,
        },
      });

      console.log(`✅ Plugin enabled: ${pluginId}`);
      return true;
    } catch (error) {
      console.error("❌ Plugin enable failed:", error);
      return false;
    }
  }

  async disablePlugin(pluginId: UUID, user: User): Promise<boolean> {
    try {
      const plugin = await this.repository.getPlugin(pluginId);
      if (!plugin) return false;

      await this.repository.updatePlugin(pluginId, {
        status: "inactive",
        settings: {
          ...plugin.settings,
          enabled: false,
        },
      });

      console.log(`✅ Plugin disabled: ${pluginId}`);
      return true;
    } catch (error) {
      console.error("❌ Plugin disable failed:", error);
      return false;
    }
  }

  // Plugin Information
  async listPlugins(): Promise<Plugin[]> {
    return await this.repository.listPlugins();
  }

  async getPlugin(pluginId: UUID): Promise<Plugin | null> {
    return await this.repository.getPlugin(pluginId);
  }

  async getPluginManifest(manifestId: string): Promise<PluginManifest | null> {
    return await this.repository.getManifest(manifestId);
  }
}
