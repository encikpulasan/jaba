// masmaCMS Plugin System Demo
// Demonstration of extensible plugin architecture

import { PluginService } from "@/lib/plugins/service.ts";
import { PluginRepository } from "@/lib/plugins/repository.ts";
import { UserRepository } from "@/lib/auth/repositories/user.ts";
import type { PluginManifest } from "@/types/plugin.ts";

async function demonstratePluginSystem() {
  console.log("\n🔌 PLUGIN SYSTEM DEMONSTRATION");
  console.log("==============================");

  const pluginService = new PluginService();
  const pluginRepository = new PluginRepository();
  const userRepository = new UserRepository();

  // Get demo user
  const demoUser = await userRepository.findByEmail("admin@example.com");
  if (!demoUser) {
    console.log("❌ Demo user not found. Please run auth demo first.");
    return;
  }

  // 1. Create Demo Plugin Manifests
  console.log("\n📋 Creating Plugin Manifests...");

  const pluginManifests: PluginManifest[] = [
    {
      id: "rich-text-editor",
      name: "Advanced Rich Text Editor",
      version: "2.1.0",
      description: "Enhanced WYSIWYG editor with advanced formatting options.",
      author: {
        name: "MasmaCMS Team",
        email: "plugins@masmacms.com",
        organization: "MasmaCMS",
      },
      type: "extension",
      category: "content-enhancement",
      tags: ["editor", "wysiwyg", "content"],
      
      minCmsVersion: "1.0.0",
      main: "index.js",
      
      permissions: ["read", "write"],
      
      homepage: "https://plugins.masmacms.com/rich-text-editor",
      license: "MIT",
      keywords: ["editor", "content", "wysiwyg"],
    },
    {
      id: "seo-optimizer",
      name: "SEO Optimizer Pro",
      version: "1.3.2",
      description: "Comprehensive SEO optimization with meta tags and analysis.",
      author: {
        name: "SEO Masters",
        email: "contact@seomasters.dev",
      },
      type: "integration",
      category: "seo-optimization",
      tags: ["seo", "meta-tags", "optimization"],
      
      minCmsVersion: "1.0.0",
      main: "seo-optimizer.js",
      
      permissions: ["read", "write"],
      
      homepage: "https://seo-optimizer.dev",
      license: "Commercial",
      premium: true,
      keywords: ["seo", "optimization", "meta"],
    },
    {
      id: "google-analytics",
      name: "Google Analytics 4 Integration",
      version: "4.0.1",
      description: "Complete Google Analytics 4 integration with tracking.",
      author: {
        name: "Analytics Pro",
        email: "support@analyticspro.com",
      },
      type: "integration",
      category: "analytics",
      tags: ["analytics", "google", "tracking"],
      
      minCmsVersion: "1.0.0",
      main: "ga4-integration.js",
      
      permissions: ["read"],
      
      homepage: "https://analyticspro.com/ga4-plugin",
      license: "MIT",
      keywords: ["google-analytics", "tracking", "analytics"],
    },
  ];

  for (const manifest of pluginManifests) {
    await pluginRepository.storeManifest(manifest);
    console.log(`  ✅ Manifest: ${manifest.name} v${manifest.version}`);
  }

  // 2. Install Plugins
  console.log("\n💾 Installing Plugins...");

  for (const manifest of pluginManifests) {
    const result = await pluginService.installPlugin(manifest, demoUser);
    
    if (result.success) {
      console.log(`  ✅ Installed: ${manifest.name} (${result.plugin?.status})`);
    } else {
      console.log(`  ❌ Failed: ${manifest.name} - ${result.error}`);
    }
  }

  // 3. Manage Plugin States
  console.log("\n⚡ Managing Plugin States...");

  const installedPlugins = await pluginService.listPlugins();
  console.log(`  📦 Total installed plugins: ${installedPlugins.length}`);

  // Enable first plugin
  if (installedPlugins.length > 0) {
    const firstPlugin = installedPlugins[0];
    await pluginService.enablePlugin(firstPlugin.id, demoUser);
    console.log(`  ✅ Enabled: ${firstPlugin.manifestId}`);
  }

  // 4. Plugin Information
  console.log("\n📊 Plugin Information...");

  for (const plugin of installedPlugins) {
    const manifest = await pluginService.getPluginManifest(plugin.manifestId);
    if (manifest) {
      console.log(`  📋 ${manifest.name}:`);
      console.log(`     Status: ${plugin.status}`);
      console.log(`     Version: ${plugin.version}`);
      console.log(`     Type: ${manifest.type}`);
      console.log(`     Author: ${manifest.author.name}`);
      console.log(`     Premium: ${manifest.premium ? 'Yes' : 'No'}`);
    }
  }

  // Demo S.log("\n⚡ Managing Plugin StaGIN SYSTEM DEMO COMPLETED");
  console.log("================================");
  console.log("🎯 Demonstrated Features:");
  console.log("   ✅ Plugin Installation & Management");
  console.log("   ✅ Plugin Manifests & Metadata");
  console.log("   ✅ Plugin Status Management");
  console.log("   ✅ Plugin Information Retrieval");
  console.log("");
  console.log("🔌 The plugin system provides a foundation for extending");
  console.log("   masmaCMS with custom functionality and integrations.");
}

// Run the demonstration
if (import.meta.main) {
  await demonstratePluginSystem();
}
