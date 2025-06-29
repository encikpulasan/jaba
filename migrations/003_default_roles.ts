// Default Roles Migration
// Sets up the default role system for masmaCMS

import { DEFAULT_ROLES, RBACManager } from "@/lib/auth/mod.ts";
import type { Migration } from "@/types";

export const defaultRolesMigration: Migration = {
  id: "003",
  name: "Default Roles Setup",
  version: 3,
  up: async () => {
    console.log("🔐 Creating default roles...");

    // Create all default roles
    const rolePromises = DEFAULT_ROLES.map(async (roleData) => {
      try {
        const role = await RBACManager.createRole(roleData);
        console.log(`✅ Created role: ${role.name}`);
        return role;
      } catch (error) {
        console.error(`❌ Failed to create role ${roleData.name}:`, error);
        throw error;
      }
    });

    await Promise.all(rolePromises);
    console.log("🎭 Default roles created successfully");
  },
  down: async () => {
    console.log("🔐 Removing default roles...");

    // Remove all default roles
    const roleNames = DEFAULT_ROLES.map((r) => r.name);

    for (const roleName of roleNames) {
      try {
        const role = await RBACManager.getRoleByName(roleName);
        if (role) {
          await RBACManager.deleteRole(role.id);
          console.log(`✅ Removed role: ${roleName}`);
        }
      } catch (error) {
        console.error(`❌ Failed to remove role ${roleName}:`, error);
      }
    }

    console.log("🎭 Default roles removed");
  },
};
