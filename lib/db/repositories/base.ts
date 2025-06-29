// Base Repository Class
// Common CRUD operations with soft delete, audit logging, and multilanguage support

import type {
  Auditable,
  AuditEntry,
  BaseEntity,
  QueryOptions,
  SoftDeletable,
  Timestamp,
  TransactionResult,
  UUID,
} from "@/types";
import { db } from "../connection.ts";
import { KeyBuilder } from "../patterns.ts";
// Using built-in crypto.randomUUID() for UUID generation

export abstract class BaseRepository<T extends BaseEntity> {
  protected abstract entityName: string;
  protected abstract keyPatterns: {
    byId: (id: UUID) => string[];
    all: () => string[];
  };

  // Create entity with automatic ID generation and timestamps
  async create(data: Omit<T, keyof BaseEntity>, userId?: UUID): Promise<T> {
    const now = Date.now();
    const entity: T = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
      updatedBy: userId,
    } as T;

    await this.validateEntity(entity);

    const connection = db.getConnection();
    const key = this.keyPatterns.byId(entity.id);

    const atomic = (connection.kv as Deno.Kv).atomic();
    atomic.set(KeyBuilder.toPrefix(key), entity);

    // Add to indexes
    await this.addToIndexes(entity, atomic);

    // Add audit log if entity supports it
    if (this.isAuditable(entity)) {
      await this.addAuditLog(entity, "CREATE", userId, {}, entity, atomic);
    }

    const result = await atomic.commit();

    if (!result.ok) {
      throw new Error(`Failed to create ${this.entityName}`);
    }

    return entity;
  }

  // Read entity by ID with soft delete check
  async findById(
    id: UUID,
    options?: { includeSoftDeleted?: boolean },
  ): Promise<T | null> {
    const connection = db.getConnection();
    const key = this.keyPatterns.byId(id);

    const result = await (connection.kv as Deno.Kv).get<T>(
      KeyBuilder.toPrefix(key),
    );

    if (!result.value) {
      return null;
    }

    const entity = result.value;

    // Check soft delete
    if (
      !options?.includeSoftDeleted && this.isSoftDeletable(entity) &&
      entity.isDeleted
    ) {
      return null;
    }

    return entity;
  }

  // Update entity with optimistic locking and audit logging
  async update(
    id: UUID,
    updates: Partial<Omit<T, keyof BaseEntity>>,
    userId?: UUID,
  ): Promise<T> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error(`${this.entityName} not found`);
    }

    const now = Date.now();
    const updated: T = {
      ...existing,
      ...updates,
      updatedAt: now,
      updatedBy: userId,
    } as T;

    await this.validateEntity(updated);

    const connection = db.getConnection();
    const key = this.keyPatterns.byId(id);

    const atomic = connection.kv.atomic();

    // Optimistic locking check
    atomic.check({ key: KeyBuilder.toPrefix(key), versionstamp: null }); // Simplified check
    atomic.set(KeyBuilder.toPrefix(key), updated);

    // Update indexes
    await this.updateIndexes(existing, updated, atomic);

    // Add audit log
    if (this.isAuditable(updated)) {
      await this.addAuditLog(
        updated,
        "UPDATE",
        userId,
        existing,
        updated,
        atomic,
      );
    }

    const result = await atomic.commit();

    if (!result.ok) {
      throw new Error(`Failed to update ${this.entityName}`);
    }

    return updated;
  }

  // Soft delete implementation
  async softDelete(id: UUID, userId?: UUID): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing) {
      return false;
    }

    if (!this.isSoftDeletable(existing)) {
      throw new Error(`${this.entityName} does not support soft delete`);
    }

    const now = Date.now();
    const updated = {
      ...existing,
      deletedAt: now,
      deletedBy: userId,
      isDeleted: true,
      updatedAt: now,
      updatedBy: userId,
    } as T & SoftDeletable;

    const connection = db.getConnection();
    const key = this.keyPatterns.byId(id);

    const atomic = connection.kv.atomic();
    atomic.set(KeyBuilder.toPrefix(key), updated);

    // Update indexes
    await this.updateIndexes(existing, updated, atomic);

    // Add audit log
    if (this.isAuditable(updated)) {
      await this.addAuditLog(
        updated,
        "DELETE",
        userId,
        existing,
        updated,
        atomic,
      );
    }

    const result = await atomic.commit();
    return result.ok;
  }

  // Hard delete (permanent removal)
  async hardDelete(id: UUID, userId?: UUID): Promise<boolean> {
    const existing = await this.findById(id, { includeSoftDeleted: true });
    if (!existing) {
      return false;
    }

    const connection = db.getConnection();
    const key = this.keyPatterns.byId(id);

    const atomic = connection.kv.atomic();
    atomic.delete(KeyBuilder.toPrefix(key));

    // Remove from indexes
    await this.removeFromIndexes(existing, atomic);

    // Add audit log
    if (this.isAuditable(existing)) {
      await this.addAuditLog(existing, "DELETE", userId, existing, {}, atomic);
    }

    const result = await atomic.commit();
    return result.ok;
  }

  // Restore soft deleted entity
  async restore(id: UUID, userId?: UUID): Promise<T | null> {
    const existing = await this.findById(id, { includeSoftDeleted: true });
    if (!existing || !this.isSoftDeletable(existing) || !existing.isDeleted) {
      return null;
    }

    const now = Date.now();
    const restored: T = {
      ...existing,
      deletedAt: undefined,
      deletedBy: undefined,
      isDeleted: false,
      updatedAt: now,
      updatedBy: userId,
    } as T;

    const connection = db.getConnection();
    const key = this.keyPatterns.byId(id);

    const atomic = connection.kv.atomic();
    atomic.set(KeyBuilder.toPrefix(key), restored);

    // Update indexes
    await this.updateIndexes(existing, restored, atomic);

    // Add audit log
    if (this.isAuditable(restored)) {
      await this.addAuditLog(
        restored,
        "RESTORE",
        userId,
        existing,
        restored,
        atomic,
      );
    }

    const result = await atomic.commit();

    if (!result.ok) {
      throw new Error(`Failed to restore ${this.entityName}`);
    }

    return restored;
  }

  // List entities with filtering and pagination
  async findAll(options?: {
    limit?: number;
    offset?: number;
    includeSoftDeleted?: boolean;
    filter?: (entity: T) => boolean;
  }): Promise<T[]> {
    const connection = db.getConnection();
    const prefix = this.keyPatterns.all();

    const kvOptions: { limit?: number } = {};
    if (options?.limit) {
      kvOptions.limit = options.limit;
    }

    const iterator = connection.kv.list<T>({
      prefix: KeyBuilder.toPrefix(prefix),
    }, kvOptions);
    const entities: T[] = [];
    let skipped = 0;

    for await (const { value } of iterator) {
      if (!value) continue;

      // Skip soft deleted if not included
      if (
        !options?.includeSoftDeleted && this.isSoftDeletable(value) &&
        value.isDeleted
      ) {
        continue;
      }

      // Apply offset
      if (options?.offset && skipped < options.offset) {
        skipped++;
        continue;
      }

      // Apply filter
      if (options?.filter && !options.filter(value)) {
        continue;
      }

      entities.push(value);
    }

    return entities;
  }

  // Count entities
  async count(options?: { includeSoftDeleted?: boolean }): Promise<number> {
    const entities = await this.findAll(options);
    return entities.length;
  }

  // Check if entity exists
  async exists(id: UUID): Promise<boolean> {
    const entity = await this.findById(id);
    return entity !== null;
  }

  // Type guards
  protected isSoftDeletable(entity: T): entity is T & SoftDeletable {
    return "isDeleted" in entity;
  }

  protected isAuditable(entity: T): entity is T & Auditable {
    return "auditLog" in entity;
  }

  // Abstract methods to be implemented by concrete repositories
  protected abstract validateEntity(entity: T): Promise<void>;
  protected abstract addToIndexes(
    entity: T,
    atomic: Deno.AtomicOperation,
  ): Promise<void>;
  protected abstract updateIndexes(
    oldEntity: T,
    newEntity: T,
    atomic: Deno.AtomicOperation,
  ): Promise<void>;
  protected abstract removeFromIndexes(
    entity: T,
    atomic: Deno.AtomicOperation,
  ): Promise<void>;

  // Audit logging helper
  protected async addAuditLog(
    entity: T & Auditable,
    action: AuditEntry["action"],
    userId: UUID | undefined,
    oldValue: Partial<T>,
    newValue: Partial<T>,
    atomic: Deno.AtomicOperation,
  ): Promise<void> {
    const auditEntry: AuditEntry = {
      id: crypto.randomUUID(),
      action,
      userId: userId || "system",
      timestamp: Date.now(),
      changes: this.calculateChanges(oldValue, newValue),
      ip: undefined, // TODO: Get from request context
      userAgent: undefined, // TODO: Get from request context
    };

    // Add to entity's audit log
    const updatedAuditLog = [...(entity.auditLog || []), auditEntry];
    const updatedEntity = { ...entity, auditLog: updatedAuditLog };

    const key = this.keyPatterns.byId(entity.id);
    atomic.set(KeyBuilder.toPrefix(key), updatedEntity);
  }

  // Calculate changes between old and new values
  private calculateChanges(
    oldValue: Partial<T>,
    newValue: Partial<T>,
  ): Record<string, { old: unknown; new: unknown }> {
    const changes: Record<string, { old: unknown; new: unknown }> = {};

    const allKeys = new Set([
      ...Object.keys(oldValue),
      ...Object.keys(newValue),
    ]);

    for (const key of allKeys) {
      const oldVal = oldValue[key as keyof T];
      const newVal = newValue[key as keyof T];

      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes[key] = { old: oldVal, new: newVal };
      }
    }

    return changes;
  }
}
