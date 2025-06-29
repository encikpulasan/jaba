/// <reference lib="deno.unstable" />

// User Repository
// User management with authentication capabilities

import { BaseRepository } from "@/lib/db/repositories/base.ts";
import { KeyPatterns } from "@/lib/db/patterns.ts";
import { PasswordManager } from "../password.ts";
import type { CreateUserData, User, UUID } from "@/types";

export class UserRepository extends BaseRepository<User> {
  protected entityName = "user";
  protected keyPatterns = KeyPatterns.users;

  // Create user with password hashing
  async createUser(userData: CreateUserData, password: string): Promise<User> {
    // Hash password
    const hashedPassword = await PasswordManager.hashPassword(password);

    // Validate email uniqueness
    const existingByEmail = await this.findByEmail(userData.email);
    if (existingByEmail) {
      throw new Error("Email already exists");
    }

    // Validate username uniqueness if provided
    if (userData.username) {
      const existingByUsername = await this.findByUsername(userData.username);
      if (existingByUsername) {
        throw new Error("Username already exists");
      }
    }

    const user: User = {
      id: crypto.randomUUID(),
      email: userData.email,
      username: userData.username,
      firstName: userData.firstName,
      lastName: userData.lastName,
      password: hashedPassword,
      passwordHistory: [hashedPassword],
      isActive: true,
      isEmailVerified: false,
      roles: userData.roles || [],
      locale: userData.locale || "en",
      timezone: userData.timezone || "UTC",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    return await this.create(user);
  }

  // Find user by email
  async findByEmail(email: string): Promise<User | null> {
    const connection = this.db.getConnection();
    const result = await (connection.kv as Deno.Kv).get<UUID>(
      this.keyPatterns.byEmail(email),
    );

    if (!result.value) {
      return null;
    }

    return await this.findById(result.value);
  }

  // Find user by username
  async findByUsername(username: string): Promise<User | null> {
    const connection = this.db.getConnection();
    const result = await (connection.kv as Deno.Kv).get<UUID>(
      this.keyPatterns.byUsername(username),
    );

    if (!result.value) {
      return null;
    }

    return await this.findById(result.value);
  }

  // Verify user password
  async verifyPassword(userId: UUID, password: string): Promise<boolean> {
    const user = await this.findById(userId);
    if (!user) {
      return false;
    }

    return await PasswordManager.verifyPassword(password, user.password);
  }

  // Update user password with history
  async updatePassword(
    userId: UUID,
    newPassword: string,
    currentUserId?: UUID,
  ): Promise<boolean> {
    const user = await this.findById(userId);
    if (!user) {
      return false;
    }

    // Check password history
    const isInHistory = await PasswordManager.isPasswordInHistory(
      newPassword,
      user.passwordHistory || [],
      5, // Last 5 passwords
    );

    if (isInHistory) {
      throw new Error(
        "Password was recently used. Please choose a different password.",
      );
    }

    // Hash new password
    const hashedPassword = await PasswordManager.hashPassword(newPassword);

    // Update password and history
    const updatedUser = {
      ...user,
      password: hashedPassword,
      passwordHistory: [...(user.passwordHistory || []), hashedPassword].slice(
        -5,
      ),
      passwordChangedAt: Date.now(),
      updatedAt: Date.now(),
      updatedBy: currentUserId,
    };

    await this.update(userId, updatedUser, currentUserId);
    return true;
  }

  // Activate/deactivate user
  async setUserStatus(
    userId: UUID,
    isActive: boolean,
    currentUserId?: UUID,
  ): Promise<boolean> {
    return !!(await this.update(userId, { isActive }, currentUserId));
  }

  // Verify user email
  async verifyEmail(userId: UUID): Promise<boolean> {
    const result = await this.update(userId, {
      isEmailVerified: true,
      emailVerifiedAt: Date.now(),
    });
    return !!result;
  }

  // Get user preferences
  async getUserPreferences(
    userId: UUID,
  ): Promise<Record<string, unknown> | null> {
    const connection = this.db.getConnection();
    const result = await (connection.kv as Deno.Kv).get<
      Record<string, unknown>
    >(
      this.keyPatterns.preferences(userId),
    );
    return result.value || null;
  }

  // Update user preferences
  async updateUserPreferences(
    userId: UUID,
    preferences: Record<string, unknown>,
  ): Promise<void> {
    const connection = this.db.getConnection();
    await (connection.kv as Deno.Kv).set(
      this.keyPatterns.preferences(userId),
      preferences,
    );
  }

  // Search users
  async searchUsers(query: string, limit = 20): Promise<User[]> {
    const allUsers = await this.findAll({ limit: 100 }); // Get more users to search through
    const lowerQuery = query.toLowerCase();

    return allUsers
      .filter((user) =>
        user.email.toLowerCase().includes(lowerQuery) ||
        user.username?.toLowerCase().includes(lowerQuery) ||
        user.firstName?.toLowerCase().includes(lowerQuery) ||
        user.lastName?.toLowerCase().includes(lowerQuery)
      )
      .slice(0, limit);
  }

  // Get users by role
  async getUsersByRole(roleId: UUID): Promise<User[]> {
    const allUsers = await this.findAll();
    return allUsers.filter((user) => user.roles.includes(roleId));
  }

  // Required abstract method implementations
  protected async validateEntity(entity: User): Promise<void> {
    if (!entity.email || !entity.email.includes("@")) {
      throw new Error("Valid email is required");
    }

    if (entity.username && entity.username.length < 3) {
      throw new Error("Username must be at least 3 characters");
    }

    if (!entity.password) {
      throw new Error("Password is required");
    }
  }

  protected async addToIndexes(entity: User, atomic: unknown): Promise<void> {
    const atomicOp = atomic as Deno.AtomicOperation;

    // Add email index
    atomicOp.set(this.keyPatterns.byEmail(entity.email), entity.id);

    // Add username index if exists
    if (entity.username) {
      atomicOp.set(this.keyPatterns.byUsername(entity.username), entity.id);
    }
  }

  protected async updateIndexes(
    oldEntity: User,
    newEntity: User,
    atomic: unknown,
  ): Promise<void> {
    const atomicOp = atomic as Deno.AtomicOperation;

    // Update email index if changed
    if (oldEntity.email !== newEntity.email) {
      atomicOp.delete(this.keyPatterns.byEmail(oldEntity.email));
      atomicOp.set(this.keyPatterns.byEmail(newEntity.email), newEntity.id);
    }

    // Update username index if changed
    if (oldEntity.username !== newEntity.username) {
      if (oldEntity.username) {
        atomicOp.delete(this.keyPatterns.byUsername(oldEntity.username));
      }
      if (newEntity.username) {
        atomicOp.set(
          this.keyPatterns.byUsername(newEntity.username),
          newEntity.id,
        );
      }
    }
  }

  protected async removeFromIndexes(
    entity: User,
    atomic: unknown,
  ): Promise<void> {
    const atomicOp = atomic as Deno.AtomicOperation;

    // Remove email index
    atomicOp.delete(this.keyPatterns.byEmail(entity.email));

    // Remove username index if exists
    if (entity.username) {
      atomicOp.delete(this.keyPatterns.byUsername(entity.username));
    }
  }
}

// Export singleton instance
export const userRepository = new UserRepository();
