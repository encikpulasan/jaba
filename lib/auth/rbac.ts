// Role-Based Access Control (RBAC)
// Comprehensive permission and role management system

import type { Permission, Role, User, UUID } from "@/types";
import { db } from "@/lib/db/mod.ts";
import { KeyPatterns } from "@/lib/db/patterns.ts";

export class RBACManager {
  // Create role with permissions
  static async createRole(
    roleData: Omit<Role, "id" | "createdAt" | "updatedAt">,
  ): Promise<Role> {
    const role: Role = {
      ...roleData,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const connection = db.getConnection();
    const atomic = (connection.kv as Deno.Kv).atomic();

    // Store role
    atomic.set(KeyPatterns.roles.byId(role.id), role);
    atomic.set(KeyPatterns.roles.byName(role.name), role.id);

    await atomic.commit();
    return role;
  }

  // Get role by ID
  static async getRole(roleId: UUID): Promise<Role | null> {
    const connection = db.getConnection();
    const result = await (connection.kv as Deno.Kv).get<Role>(
      KeyPatterns.roles.byId(roleId),
    );
    return result.value || null;
  }

  // Get role by name
  static async getRoleByName(name: string): Promise<Role | null> {
    const connection = db.getConnection();

    // Get role ID first
    const roleIdResult = await (connection.kv as Deno.Kv).get<UUID>(
      KeyPatterns.roles.byName(name),
    );

    if (!roleIdResult.value) {
      return null;
    }

    return await this.getRole(roleIdResult.value);
  }

  // Assign role to user
  static async assignRoleToUser(userId: UUID, roleId: UUID): Promise<boolean> {
    const connection = db.getConnection();

    // Get current user roles
    const userRolesResult = await (connection.kv as Deno.Kv).get<UUID[]>(
      KeyPatterns.users.roles(userId),
    );

    const currentRoles = userRolesResult.value || [];

    // Add role if not already assigned
    if (!currentRoles.includes(roleId)) {
      const updatedRoles = [...currentRoles, roleId];
      await (connection.kv as Deno.Kv).set(
        KeyPatterns.users.roles(userId),
        updatedRoles,
      );
      return true;
    }

    return false;
  }

  // Remove role from user
  static async removeRoleFromUser(
    userId: UUID,
    roleId: UUID,
  ): Promise<boolean> {
    const connection = db.getConnection();

    // Get current user roles
    const userRolesResult = await (connection.kv as Deno.Kv).get<UUID[]>(
      KeyPatterns.users.roles(userId),
    );

    const currentRoles = userRolesResult.value || [];
    const updatedRoles = currentRoles.filter((id) => id !== roleId);

    if (updatedRoles.length !== currentRoles.length) {
      await (connection.kv as Deno.Kv).set(
        KeyPatterns.users.roles(userId),
        updatedRoles,
      );
      return true;
    }

    return false;
  }

  // Get user roles
  static async getUserRoles(userId: UUID): Promise<Role[]> {
    const connection = db.getConnection();

    // Get role IDs
    const userRolesResult = await (connection.kv as Deno.Kv).get<UUID[]>(
      KeyPatterns.users.roles(userId),
    );

    const roleIds = userRolesResult.value || [];
    const roles: Role[] = [];

    // Fetch role details
    for (const roleId of roleIds) {
      const role = await this.getRole(roleId);
      if (role) {
        roles.push(role);
      }
    }

    return roles;
  }

  // Get user permissions (flattened from all roles)
  static async getUserPermissions(userId: UUID): Promise<string[]> {
    const roles = await this.getUserRoles(userId);
    const permissions = new Set<string>();

    for (const role of roles) {
      for (const permission of role.permissions) {
        permissions.add(permission);
      }
    }

    return Array.from(permissions);
  }

  // Check if user has permission
  static async userHasPermission(
    userId: UUID,
    permission: string,
  ): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId);
    return permissions.includes(permission) || permissions.includes("*");
  }

  // Check if user has any of the required permissions
  static async userHasAnyPermission(
    userId: UUID,
    requiredPermissions: string[],
  ): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId);

    // Check for wildcard permission
    if (permissions.includes("*")) {
      return true;
    }

    return requiredPermissions.some((perm) => permissions.includes(perm));
  }

  // Check if user has all required permissions
  static async userHasAllPermissions(
    userId: UUID,
    requiredPermissions: string[],
  ): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId);

    // Check for wildcard permission
    if (permissions.includes("*")) {
      return true;
    }

    return requiredPermissions.every((perm) => permissions.includes(perm));
  }

  // Check if user has role
  static async userHasRole(userId: UUID, roleName: string): Promise<boolean> {
    const roles = await this.getUserRoles(userId);
    return roles.some((role) => role.name === roleName);
  }

  // List all roles
  static async listRoles(): Promise<Role[]> {
    const connection = db.getConnection();
    const roles: Role[] = [];

    const iterator = (connection.kv as Deno.Kv).list<Role>({
      prefix: KeyPatterns.roles.all(),
    });

    for await (const { value } of iterator) {
      if (value) {
        roles.push(value);
      }
    }

    return roles.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Update role
  static async updateRole(
    roleId: UUID,
    updates: Partial<Omit<Role, "id" | "createdAt">>,
  ): Promise<Role | null> {
    const existingRole = await this.getRole(roleId);
    if (!existingRole) {
      return null;
    }

    const updatedRole: Role = {
      ...existingRole,
      ...updates,
      updatedAt: Date.now(),
    };

    const connection = db.getConnection();
    const atomic = (connection.kv as Deno.Kv).atomic();

    // Update role
    atomic.set(KeyPatterns.roles.byId(roleId), updatedRole);

    // Update name index if name changed
    if (updates.name && updates.name !== existingRole.name) {
      atomic.delete(KeyPatterns.roles.byName(existingRole.name));
      atomic.set(KeyPatterns.roles.byName(updates.name), roleId);
    }

    await atomic.commit();
    return updatedRole;
  }

  // Delete role
  static async deleteRole(roleId: UUID): Promise<boolean> {
    const role = await this.getRole(roleId);
    if (!role) {
      return false;
    }

    const connection = db.getConnection();
    const atomic = (connection.kv as Deno.Kv).atomic();

    // Remove role
    atomic.delete(KeyPatterns.roles.byId(roleId));
    atomic.delete(KeyPatterns.roles.byName(role.name));

    await atomic.commit();

    // TODO: Remove role from all users who have it
    // This would require scanning all users, which could be expensive
    // Consider implementing a background cleanup job

    return true;
  }
}

// Permission constants for masmaCMS
export const Permissions = {
  // System permissions
  SYSTEM_ADMIN: "system.admin",
  SYSTEM_SETTINGS: "system.settings",
  SYSTEM_BACKUP: "system.backup",
  SYSTEM_LOGS: "system.logs",

  // User management
  USERS_CREATE: "users.create",
  USERS_READ: "users.read",
  USERS_UPDATE: "users.update",
  USERS_DELETE: "users.delete",
  USERS_MANAGE_ROLES: "users.manage_roles",

  // Content management
  CONTENT_CREATE: "content.create",
  CONTENT_READ: "content.read",
  CONTENT_UPDATE: "content.update",
  CONTENT_DELETE: "content.delete",
  CONTENT_PUBLISH: "content.publish",
  CONTENT_MODERATE: "content.moderate",

  // Media management
  MEDIA_UPLOAD: "media.upload",
  MEDIA_READ: "media.read",
  MEDIA_UPDATE: "media.update",
  MEDIA_DELETE: "media.delete",
  MEDIA_ORGANIZE: "media.organize",

  // Schema management
  SCHEMAS_CREATE: "schemas.create",
  SCHEMAS_READ: "schemas.read",
  SCHEMAS_UPDATE: "schemas.update",
  SCHEMAS_DELETE: "schemas.delete",

  // Translation management
  TRANSLATIONS_CREATE: "translations.create",
  TRANSLATIONS_READ: "translations.read",
  TRANSLATIONS_UPDATE: "translations.update",
  TRANSLATIONS_DELETE: "translations.delete",

  // API access
  API_READ: "api.read",
  API_WRITE: "api.write",
  API_ADMIN: "api.admin",

  // Team management
  TEAMS_CREATE: "teams.create",
  TEAMS_READ: "teams.read",
  TEAMS_UPDATE: "teams.update",
  TEAMS_DELETE: "teams.delete",
  TEAMS_MANAGE_MEMBERS: "teams.manage_members",

  // Workflows
  WORKFLOWS_CREATE: "workflows.create",
  WORKFLOWS_READ: "workflows.read",
  WORKFLOWS_UPDATE: "workflows.update",
  WORKFLOWS_DELETE: "workflows.delete",
  WORKFLOWS_MANAGE: "workflows.manage",
} as const;

// Default roles for masmaCMS
export const DefaultRoles = {
  SUPER_ADMIN: {
    name: "Super Admin",
    description: "Full system access with all permissions",
    permissions: ["*"], // Wildcard permission
    isSystem: true,
    level: 1000,
  },

  ADMIN: {
    name: "Administrator",
    description: "Full content and user management access",
    permissions: [
      Permissions.USERS_CREATE,
      Permissions.USERS_READ,
      Permissions.USERS_UPDATE,
      Permissions.USERS_DELETE,
      Permissions.CONTENT_CREATE,
      Permissions.CONTENT_READ,
      Permissions.CONTENT_UPDATE,
      Permissions.CONTENT_DELETE,
      Permissions.CONTENT_PUBLISH,
      Permissions.CONTENT_MODERATE,
      Permissions.MEDIA_UPLOAD,
      Permissions.MEDIA_READ,
      Permissions.MEDIA_UPDATE,
      Permissions.MEDIA_DELETE,
      Permissions.MEDIA_ORGANIZE,
      Permissions.SCHEMAS_CREATE,
      Permissions.SCHEMAS_READ,
      Permissions.SCHEMAS_UPDATE,
      Permissions.SCHEMAS_DELETE,
      Permissions.API_READ,
      Permissions.API_WRITE,
    ],
    isSystem: true,
    level: 900,
  },

  EDITOR: {
    name: "Editor",
    description: "Content creation and editing with publishing rights",
    permissions: [
      Permissions.CONTENT_CREATE,
      Permissions.CONTENT_READ,
      Permissions.CONTENT_UPDATE,
      Permissions.CONTENT_PUBLISH,
      Permissions.MEDIA_UPLOAD,
      Permissions.MEDIA_READ,
      Permissions.MEDIA_UPDATE,
      Permissions.TRANSLATIONS_CREATE,
      Permissions.TRANSLATIONS_READ,
      Permissions.TRANSLATIONS_UPDATE,
      Permissions.API_READ,
    ],
    isSystem: true,
    level: 500,
  },

  AUTHOR: {
    name: "Author",
    description: "Content creation and editing without publishing rights",
    permissions: [
      Permissions.CONTENT_CREATE,
      Permissions.CONTENT_READ,
      Permissions.CONTENT_UPDATE,
      Permissions.MEDIA_UPLOAD,
      Permissions.MEDIA_READ,
      Permissions.TRANSLATIONS_READ,
      Permissions.API_READ,
    ],
    isSystem: true,
    level: 300,
  },

  VIEWER: {
    name: "Viewer",
    description: "Read-only access to content and basic features",
    permissions: [
      Permissions.CONTENT_READ,
      Permissions.MEDIA_READ,
      Permissions.TRANSLATIONS_READ,
      Permissions.API_READ,
    ],
    isSystem: true,
    level: 100,
  },
} as const;

// Role hierarchy utility
export class RoleHierarchy {
  // Check if role A has higher level than role B
  static isHigherLevel(roleA: Role, roleB: Role): boolean {
    return roleA.level > roleB.level;
  }

  // Check if user can manage another user based on role hierarchy
  static async canManageUser(
    managerId: UUID,
    targetUserId: UUID,
  ): Promise<boolean> {
    const managerRoles = await RBACManager.getUserRoles(managerId);
    const targetRoles = await RBACManager.getUserRoles(targetUserId);

    // Get highest level for each user
    const managerLevel = Math.max(...managerRoles.map((r) => r.level));
    const targetLevel = Math.max(...targetRoles.map((r) => r.level));

    return managerLevel > targetLevel;
  }

  // Get role hierarchy tree
  static async getRoleHierarchy(): Promise<
    Array<{ role: Role; level: number }>
  > {
    const roles = await RBACManager.listRoles();
    return roles
      .map((role) => ({ role, level: role.level }))
      .sort((a, b) => b.level - a.level);
  }
}
