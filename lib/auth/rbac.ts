// Role-Based Access Control (RBAC) System
// Handles permissions, roles, and access control

import type { Permission, UUID } from "@/types";
import { db } from "@/lib/db/mod.ts";
import { KeyPatterns } from "@/lib/db/patterns.ts";
import { BaseRepository } from "@/lib/db/repositories/base.ts";

export interface Role {
  id: UUID;
  name: string;
  description: string;
  permissions: Permission[];
  isSystem: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface UserRole {
  userId: UUID;
  roleId: UUID;
  assignedAt: number;
  assignedBy: UUID;
}

// Permission constants organized by category
export const CONTENT_PERMISSIONS: Permission[] = [
  "create_content",
  "edit_content",
  "edit_own_content",
  "delete_content",
  "delete_own_content",
  "publish_content",
  "view_content",
  "view_unpublished_content",
];

export const MEDIA_PERMISSIONS: Permission[] = [
  "upload_media",
  "edit_media",
  "delete_media",
  "view_media",
  "view_own_media",
];

export const USER_PERMISSIONS: Permission[] = [
  "create_users",
  "edit_users",
  "delete_users",
  "view_users",
  "manage_roles",
  "view_roles",
];

export const SYSTEM_PERMISSIONS: Permission[] = [
  "view_system_settings",
  "edit_system_settings",
  "manage_backups",
  "view_audit_logs",
  "manage_plugins",
];

export const TRANSLATION_PERMISSIONS: Permission[] = [
  "create_translations",
  "edit_translations",
  "delete_translations",
  "view_translations",
  "manage_locales",
  "review_translations",
];

export const WORKFLOW_PERMISSIONS: Permission[] = [
  "create_workflows",
  "edit_workflows",
  "delete_workflows",
  "view_workflows",
  "execute_workflows",
];

export const API_KEY_PERMISSIONS: Permission[] = [
  "manage_api_keys", // Create and manage own API keys
  "manage_all_api_keys", // Manage API keys for all users (admin)
  "view_api_usage", // View API usage statistics
];

// All permissions combined
export const ALL_PERMISSIONS: Permission[] = [
  ...CONTENT_PERMISSIONS,
  ...MEDIA_PERMISSIONS,
  ...USER_PERMISSIONS,
  ...SYSTEM_PERMISSIONS,
  ...TRANSLATION_PERMISSIONS,
  ...WORKFLOW_PERMISSIONS,
  ...API_KEY_PERMISSIONS,
];

// Default roles for masmaCMS
export const DEFAULT_ROLES: Omit<Role, "id" | "createdAt" | "updatedAt">[] = [
  {
    name: "Super Admin",
    description: "Full system access with all permissions",
    permissions: ALL_PERMISSIONS,
    isSystem: true,
  },
  {
    name: "Administrator",
    description: "Administrative access with most permissions",
    permissions: [
      ...CONTENT_PERMISSIONS,
      ...MEDIA_PERMISSIONS,
      ...USER_PERMISSIONS,
      ...SYSTEM_PERMISSIONS.filter((p) => p !== "manage_plugins"),
      ...TRANSLATION_PERMISSIONS,
      ...WORKFLOW_PERMISSIONS,
      ...API_KEY_PERMISSIONS,
    ],
    isSystem: true,
  },
  {
    name: "Editor",
    description: "Content management and editing capabilities",
    permissions: [
      ...CONTENT_PERMISSIONS,
      ...MEDIA_PERMISSIONS,
      "view_users",
      ...TRANSLATION_PERMISSIONS,
      "view_workflows",
      "execute_workflows",
      "manage_api_keys",
      "view_api_usage",
    ],
    isSystem: true,
  },
  {
    name: "Author",
    description: "Content creation and basic editing",
    permissions: [
      "create_content",
      "edit_own_content",
      "delete_own_content",
      "view_content",
      "view_unpublished_content",
      "upload_media",
      "view_own_media",
      "view_translations",
      "manage_api_keys",
    ],
    isSystem: true,
  },
  {
    name: "Viewer",
    description: "Read-only access to content",
    permissions: [
      "view_content",
      "view_media",
      "view_translations",
    ],
    isSystem: true,
  },
];

class RoleRepository extends BaseRepository<Role> {
  protected entityName = "role";
  protected keyPatterns = KeyPatterns.roles;

  // Get role by name
  async findByName(name: string): Promise<Role | null> {
    const connection = db.getConnection();
    const result = await (connection.kv as Deno.Kv).get<UUID>(
      KeyPatterns.roles.byName(name),
    );

    if (!result.value) {
      return null;
    }

    return await this.findById(result.value);
  }

  // Get system roles
  async getSystemRoles(): Promise<Role[]> {
    const connection = db.getConnection();
    const roles: Role[] = [];

    // Get all roles and filter for system roles
    const allRoles = await this.findAll();
    return allRoles.filter((role) => role.isSystem);
  }

  // Required abstract method implementations
  protected async validateEntity(entity: Role): Promise<void> {
    if (!entity.name || entity.name.trim().length === 0) {
      throw new Error("Role name is required");
    }

    if (!entity.permissions || !Array.isArray(entity.permissions)) {
      throw new Error("Role permissions must be an array");
    }

    // Check for duplicate name
    const existing = await this.findByName(entity.name);
    if (existing && existing.id !== entity.id) {
      throw new Error("Role name must be unique");
    }
  }

  protected async addToIndexes(
    entity: Role,
    atomic: Deno.AtomicOperation,
  ): Promise<void> {
    // Add name index
    atomic.set(KeyPatterns.roles.byName(entity.name), entity.id);
  }

  protected async updateIndexes(
    oldEntity: Role,
    newEntity: Role,
    atomic: Deno.AtomicOperation,
  ): Promise<void> {
    // Update name index if name changed
    if (oldEntity.name !== newEntity.name) {
      atomic.delete(KeyPatterns.roles.byName(oldEntity.name));
      atomic.set(KeyPatterns.roles.byName(newEntity.name), newEntity.id);
    }
  }

  protected async removeFromIndexes(
    entity: Role,
    atomic: Deno.AtomicOperation,
  ): Promise<void> {
    // Remove name index
    atomic.delete(KeyPatterns.roles.byName(entity.name));
  }
}

export class RBACManager {
  private static roleRepo = new RoleRepository();

  // Initialize default roles
  static async initializeDefaultRoles(): Promise<void> {
    for (const roleData of DEFAULT_ROLES) {
      const existingRole = await this.roleRepo.findByName(roleData.name);
      if (!existingRole) {
        await this.roleRepo.create(roleData);
        console.log(`Created default role: ${roleData.name}`);
      }
    }
  }

  // Get all roles
  static async getRoles(): Promise<Role[]> {
    return await this.roleRepo.findAll();
  }

  // Get role by ID
  static async getRole(roleId: UUID): Promise<Role | null> {
    return await this.roleRepo.findById(roleId);
  }

  // Get role by name
  static async getRoleByName(name: string): Promise<Role | null> {
    return await this.roleRepo.findByName(name);
  }

  // Create new role
  static async createRole(
    roleData: Omit<Role, "id" | "createdAt" | "updatedAt">,
  ): Promise<Role> {
    return await this.roleRepo.create(roleData);
  }

  // Update role
  static async updateRole(
    roleId: UUID,
    updates: Partial<Role>,
  ): Promise<Role | null> {
    return await this.roleRepo.update(roleId, updates);
  }

  // Delete role
  static async deleteRole(roleId: UUID): Promise<boolean> {
    const role = await this.roleRepo.findById(roleId);
    if (!role || role.isSystem) {
      return false; // Cannot delete system roles
    }

    return await this.roleRepo.hardDelete(roleId);
  }

  // Assign role to user
  static async assignRole(
    userId: UUID,
    roleId: UUID,
    assignedBy: UUID,
  ): Promise<boolean> {
    const connection = db.getConnection();
    const userRole: UserRole = {
      userId,
      roleId,
      assignedAt: Date.now(),
      assignedBy,
    };

    await (connection.kv as Deno.Kv).set(
      KeyPatterns.userRoles.byUserRole(userId, roleId),
      userRole,
    );

    return true;
  }

  // Alias for assignRole to match usage in auth service
  static async assignRoleToUser(
    userId: UUID,
    roleId: UUID,
    assignedBy?: UUID,
  ): Promise<boolean> {
    return await this.assignRole(userId, roleId, assignedBy || "system");
  }

  // Remove role from user
  static async removeRole(userId: UUID, roleId: UUID): Promise<boolean> {
    const connection = db.getConnection();
    await (connection.kv as Deno.Kv).delete(
      KeyPatterns.userRoles.byUserRole(userId, roleId),
    );

    return true;
  }

  // Get user roles
  static async getUserRoles(userId: UUID): Promise<Role[]> {
    const connection = db.getConnection();
    const roles: Role[] = [];

    const iterator = (connection.kv as Deno.Kv).list<UserRole>({
      prefix: KeyPatterns.userRoles.byUser(userId),
    });

    for await (const { value } of iterator) {
      if (value) {
        const role = await this.roleRepo.findById(value.roleId);
        if (role) {
          roles.push(role);
        }
      }
    }

    return roles;
  }

  // Get user permissions (aggregated from all roles)
  static async getUserPermissions(userId: UUID): Promise<Permission[]> {
    const roles = await this.getUserRoles(userId);
    const permissions = new Set<Permission>();

    for (const role of roles) {
      for (const permission of role.permissions) {
        permissions.add(permission);
      }
    }

    return Array.from(permissions);
  }

  // Check if user has specific permission
  static async userHasPermission(
    userId: UUID,
    permission: Permission,
  ): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId);
    return permissions.includes(permission);
  }

  // Check if user has specific role
  static async userHasRole(userId: UUID, roleName: string): Promise<boolean> {
    const roles = await this.getUserRoles(userId);
    return roles.some((role) => role.name === roleName);
  }

  // Check if user has any of the specified permissions
  static async userHasAnyPermission(
    userId: UUID,
    permissions: Permission[],
  ): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(userId);
    return permissions.some((permission) =>
      userPermissions.includes(permission)
    );
  }

  // Check if user has all of the specified permissions
  static async userHasAllPermissions(
    userId: UUID,
    permissions: Permission[],
  ): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(userId);
    return permissions.every((permission) =>
      userPermissions.includes(permission)
    );
  }

  // Get users with specific role
  static async getUsersWithRole(roleId: UUID): Promise<UUID[]> {
    const connection = db.getConnection();
    const userIds: UUID[] = [];

    const iterator = (connection.kv as Deno.Kv).list<UserRole>({
      prefix: KeyPatterns.userRoles.byRole(roleId),
    });

    for await (const { value } of iterator) {
      if (value) {
        userIds.push(value.userId);
      }
    }

    return userIds;
  }

  // Get users with specific permission
  static async getUsersWithPermission(permission: Permission): Promise<UUID[]> {
    const roles = await this.roleRepo.findAll();
    const rolesWithPermission = roles.filter((role) =>
      role.permissions.includes(permission)
    );

    const userIds = new Set<UUID>();
    for (const role of rolesWithPermission) {
      const roleUserIds = await this.getUsersWithRole(role.id);
      roleUserIds.forEach((id) => userIds.add(id));
    }

    return Array.from(userIds);
  }
}

export default RBACManager;
