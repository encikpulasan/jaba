// Media Repository
// Advanced media file management with variants, metadata, and folder organization

import { BaseRepository } from "@/lib/db/repositories/base.ts";
import { KeyPatterns } from "@/lib/db/patterns.ts";
import type {
  BaseEntity,
  MediaFile,
  MediaFolder,
  MediaMetadata,
  MediaVariant,
  UUID,
} from "@/types";
import { db } from "@/lib/db/connection.ts";

export class MediaRepository extends BaseRepository<MediaFile> {
  protected entityName = "media";
  protected keyPatterns = KeyPatterns.media;

  // Create media file with metadata
  async createMediaFile(
    fileData: Omit<MediaFile, keyof BaseEntity>,
    userId: UUID,
  ): Promise<MediaFile> {
    const mediaFile: MediaFile = {
      id: crypto.randomUUID(),
      ...fileData,
      metadata: {
        analyzed: false,
        processingStatus: "pending",
        ...fileData.metadata,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: userId,
      updatedBy: userId,
      version: 1,
      auditLog: [],
      isDeleted: false,
    };

    const created = await this.create(mediaFile, userId);

    // Schedule background processing
    await this.scheduleProcessing(created.id);

    return created;
  }

  // Find media by folder
  async findByFolder(
    folderId: UUID,
    options?: {
      mimeTypePrefix?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<MediaFile[]> {
    const connection = db.getConnection();
    const files: MediaFile[] = [];

    const iterator = (connection.kv as Deno.Kv).list<UUID>({
      prefix: KeyPatterns.media.byFolder(folderId),
    });

    for await (const { value } of iterator) {
      if (value) {
        const file = await this.findById(value);
        if (file && !file.isDeleted) {
          // Apply mime type filter if specified
          if (
            options?.mimeTypePrefix &&
            !file.mimeType.startsWith(options.mimeTypePrefix)
          ) {
            continue;
          }
          files.push(file);
        }
      }
    }

    // Sort by creation date (newest first)
    files.sort((a, b) => b.createdAt - a.createdAt);

    // Apply pagination
    const offset = options?.offset || 0;
    const limit = options?.limit || 50;
    return files.slice(offset, offset + limit);
  }

  // Find media by type (images, videos, documents, etc.)
  async findByType(
    mimeTypePrefix: string,
    options?: {
      folder?: UUID;
      limit?: number;
      offset?: number;
    },
  ): Promise<MediaFile[]> {
    const allFiles = await this.findAll();
    let filteredFiles = allFiles.filter((file) =>
      file.mimeType.startsWith(mimeTypePrefix) && !file.isDeleted
    );

    // Filter by folder if specified
    if (options?.folder) {
      filteredFiles = filteredFiles.filter((file) =>
        file.folder === options.folder
      );
    }

    // Sort by creation date (newest first)
    filteredFiles.sort((a, b) => b.createdAt - a.createdAt);

    // Apply pagination
    const offset = options?.offset || 0;
    const limit = options?.limit || 50;
    return filteredFiles.slice(offset, offset + limit);
  }

  // Search media files
  async searchMedia(
    query: string,
    options?: {
      mimeTypePrefix?: string;
      folder?: UUID;
      limit?: number;
    },
  ): Promise<MediaFile[]> {
    const allFiles = await this.findAll();
    const lowerQuery = query.toLowerCase();

    let results = allFiles.filter((file) => {
      if (file.isDeleted) return false;

      const filenameMatch = file.filename.toLowerCase().includes(lowerQuery);
      const originalNameMatch = file.originalName.toLowerCase().includes(
        lowerQuery,
      );
      const altMatch = file.alt?.toLowerCase().includes(lowerQuery);
      const captionMatch = file.caption?.toLowerCase().includes(lowerQuery);
      const tagMatch = file.tags.some((tag) =>
        tag.toLowerCase().includes(lowerQuery)
      );

      return filenameMatch || originalNameMatch || altMatch || captionMatch ||
        tagMatch;
    });

    // Apply filters
    if (options?.mimeTypePrefix) {
      results = results.filter((file) =>
        file.mimeType.startsWith(options.mimeTypePrefix!)
      );
    }

    if (options?.folder) {
      results = results.filter((file) => file.folder === options.folder);
    }

    // Sort by relevance (filename matches first, then others)
    results.sort((a, b) => {
      const aFilenameMatch = a.filename.toLowerCase().includes(lowerQuery);
      const bFilenameMatch = b.filename.toLowerCase().includes(lowerQuery);

      if (aFilenameMatch && !bFilenameMatch) return -1;
      if (!aFilenameMatch && bFilenameMatch) return 1;

      return b.createdAt - a.createdAt;
    });

    const limit = options?.limit || 20;
    return results.slice(0, limit);
  }

  // Update media metadata (after processing)
  async updateMetadata(
    id: UUID,
    metadata: Partial<MediaMetadata>,
    userId: UUID,
  ): Promise<MediaFile> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error("Media file not found");
    }

    const updatedMetadata = {
      ...existing.metadata,
      ...metadata,
    };

    return await this.update(id, { metadata: updatedMetadata }, userId);
  }

  // Add variant to media file
  async addVariant(
    id: UUID,
    variant: MediaVariant,
    userId: UUID,
  ): Promise<MediaFile> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error("Media file not found");
    }

    const variants = existing.metadata.variants || [];

    // Remove existing variant with same name
    const filteredVariants = variants.filter((v) => v.name !== variant.name);

    // Add new variant
    const updatedVariants = [...filteredVariants, variant];

    return await this.updateMetadata(id, {
      variants: updatedVariants,
    }, userId);
  }

  // Get media usage across content
  async getMediaUsage(id: UUID): Promise<{
    contentReferences: Array<{ contentId: UUID; field: string }>;
    totalReferences: number;
  }> {
    // This would scan all content for references to this media file
    // For now, return empty structure - this would be implemented with
    // a proper search index in production
    return {
      contentReferences: [],
      totalReferences: 0,
    };
  }

  // Find orphaned media (not referenced by any content)
  async findOrphanedMedia(): Promise<MediaFile[]> {
    const allMedia = await this.findAll();
    const orphaned: MediaFile[] = [];

    for (const media of allMedia) {
      if (media.isDeleted) continue;

      const usage = await this.getMediaUsage(media.id);
      if (usage.totalReferences === 0) {
        orphaned.push(media);
      }
    }

    return orphaned;
  }

  // Required abstract method implementations
  protected async validateEntity(entity: MediaFile): Promise<void> {
    if (!entity.filename || entity.filename.trim().length === 0) {
      throw new Error("Filename is required");
    }

    if (!entity.originalName || entity.originalName.trim().length === 0) {
      throw new Error("Original name is required");
    }

    if (!entity.mimeType || entity.mimeType.trim().length === 0) {
      throw new Error("MIME type is required");
    }

    if (!entity.url || entity.url.trim().length === 0) {
      throw new Error("File URL is required");
    }

    if (entity.size <= 0) {
      throw new Error("File size must be greater than zero");
    }
  }

  protected async addToIndexes(
    entity: MediaFile,
    atomic: Deno.AtomicOperation,
  ): Promise<void> {
    // Add folder index
    if (entity.folder) {
      atomic.set(KeyPatterns.media.byFolder(entity.folder), entity.id);
    }

    // Add type index
    const typePrefix = entity.mimeType.split("/")[0];
    atomic.set(KeyPatterns.media.byType(typePrefix), entity.id);

    // Add uploader index
    atomic.set(KeyPatterns.media.byUploader(entity.uploadedBy), entity.id);

    // Add filename index (for search)
    atomic.set(KeyPatterns.media.byFilename(entity.filename), entity.id);
  }

  protected async updateIndexes(
    oldEntity: MediaFile,
    newEntity: MediaFile,
    atomic: Deno.AtomicOperation,
  ): Promise<void> {
    // Update folder index if changed
    if (oldEntity.folder !== newEntity.folder) {
      if (oldEntity.folder) {
        atomic.delete(KeyPatterns.media.byFolder(oldEntity.folder));
      }
      if (newEntity.folder) {
        atomic.set(KeyPatterns.media.byFolder(newEntity.folder), newEntity.id);
      }
    }

    // Update type index if changed
    const oldTypePrefix = oldEntity.mimeType.split("/")[0];
    const newTypePrefix = newEntity.mimeType.split("/")[0];
    if (oldTypePrefix !== newTypePrefix) {
      atomic.delete(KeyPatterns.media.byType(oldTypePrefix));
      atomic.set(KeyPatterns.media.byType(newTypePrefix), newEntity.id);
    }

    // Update filename index if changed
    if (oldEntity.filename !== newEntity.filename) {
      atomic.delete(KeyPatterns.media.byFilename(oldEntity.filename));
      atomic.set(
        KeyPatterns.media.byFilename(newEntity.filename),
        newEntity.id,
      );
    }
  }

  protected async removeFromIndexes(
    entity: MediaFile,
    atomic: Deno.AtomicOperation,
  ): Promise<void> {
    if (entity.folder) {
      atomic.delete(KeyPatterns.media.byFolder(entity.folder));
    }

    const typePrefix = entity.mimeType.split("/")[0];
    atomic.delete(KeyPatterns.media.byType(typePrefix));
    atomic.delete(KeyPatterns.media.byUploader(entity.uploadedBy));
    atomic.delete(KeyPatterns.media.byFilename(entity.filename));
  }

  // Background processing scheduling
  private async scheduleProcessing(mediaId: UUID): Promise<void> {
    // In a real implementation, this would add to a job queue
    // For now, we'll just log that processing was scheduled
    console.log(`🔄 Scheduled processing for media: ${mediaId}`);
  }
}

// Folder Repository
export class MediaFolderRepository extends BaseRepository<MediaFolder> {
  protected entityName = "media_folders";
  protected keyPatterns = KeyPatterns.folders;

  // Create folder with path validation
  async createFolder(
    folderData: Omit<MediaFolder, keyof BaseEntity | "path">,
    userId: UUID,
  ): Promise<MediaFolder> {
    // Generate path based on parent
    let path = "/";
    if (folderData.parentId) {
      const parent = await this.findById(folderData.parentId);
      if (!parent) {
        throw new Error("Parent folder not found");
      }
      path = `${parent.path}${folderData.name}/`;
    } else {
      path = `/${folderData.name}/`;
    }

    // Check for duplicate names in same parent
    const existingFolder = await this.findByPath(path);
    if (existingFolder) {
      throw new Error(
        "Folder with this name already exists in the same location",
      );
    }

    const folder: MediaFolder = {
      id: crypto.randomUUID(),
      ...folderData,
      path,
      permissions: folderData.permissions || {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: userId,
      updatedBy: userId,
      version: 1,
      auditLog: [],
      isDeleted: false,
    };

    return await this.create(folder, userId);
  }

  // Find folder by path
  async findByPath(path: string): Promise<MediaFolder | null> {
    const connection = db.getConnection();
    const result = await (connection.kv as Deno.Kv).get<UUID>(
      KeyPatterns.folders.byPath(path),
    );

    if (!result.value) {
      return null;
    }

    return await this.findById(result.value);
  }

  // Get folder children
  async getChildren(parentId: UUID): Promise<MediaFolder[]> {
    const connection = db.getConnection();
    const children: MediaFolder[] = [];

    const iterator = (connection.kv as Deno.Kv).list<UUID>({
      prefix: KeyPatterns.folders.byParent(parentId),
    });

    for await (const { value } of iterator) {
      if (value) {
        const folder = await this.findById(value);
        if (folder && !folder.isDeleted) {
          children.push(folder);
        }
      }
    }

    return children.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Get folder tree from root
  async getFolderTree(): Promise<MediaFolder[]> {
    const allFolders = await this.findAll();
    const activeFolders = allFolders.filter((f) => !f.isDeleted);

    // Build tree structure
    const folderMap = new Map<
      UUID,
      MediaFolder & { children: MediaFolder[] }
    >();
    const rootFolders: Array<MediaFolder & { children: MediaFolder[] }> = [];

    // Initialize all folders
    activeFolders.forEach((folder) => {
      folderMap.set(folder.id, { ...folder, children: [] });
    });

    // Build parent-child relationships
    activeFolders.forEach((folder) => {
      const folderWithChildren = folderMap.get(folder.id)!;

      if (folder.parentId) {
        const parent = folderMap.get(folder.parentId);
        if (parent) {
          parent.children.push(folderWithChildren);
        }
      } else {
        rootFolders.push(folderWithChildren);
      }
    });

    return rootFolders;
  }

  // Required abstract method implementations
  protected async validateEntity(entity: MediaFolder): Promise<void> {
    if (!entity.name || entity.name.trim().length === 0) {
      throw new Error("Folder name is required");
    }

    if (!entity.path || entity.path.trim().length === 0) {
      throw new Error("Folder path is required");
    }

    // Validate folder name doesn't contain invalid characters
    if (!/^[a-zA-Z0-9\s\-_]+$/.test(entity.name)) {
      throw new Error("Folder name contains invalid characters");
    }
  }

  protected async addToIndexes(
    entity: MediaFolder,
    atomic: Deno.AtomicOperation,
  ): Promise<void> {
    atomic.set(KeyPatterns.folders.byPath(entity.path), entity.id);

    if (entity.parentId) {
      atomic.set(KeyPatterns.folders.byParent(entity.parentId), entity.id);
    } else {
      atomic.set(KeyPatterns.folders.root(), entity.id);
    }
  }

  protected async updateIndexes(
    oldEntity: MediaFolder,
    newEntity: MediaFolder,
    atomic: Deno.AtomicOperation,
  ): Promise<void> {
    // Update path index if changed
    if (oldEntity.path !== newEntity.path) {
      atomic.delete(KeyPatterns.folders.byPath(oldEntity.path));
      atomic.set(KeyPatterns.folders.byPath(newEntity.path), newEntity.id);
    }

    // Update parent index if changed
    if (oldEntity.parentId !== newEntity.parentId) {
      if (oldEntity.parentId) {
        atomic.delete(KeyPatterns.folders.byParent(oldEntity.parentId));
      } else {
        atomic.delete(KeyPatterns.folders.root());
      }

      if (newEntity.parentId) {
        atomic.set(
          KeyPatterns.folders.byParent(newEntity.parentId),
          newEntity.id,
        );
      } else {
        atomic.set(KeyPatterns.folders.root(), newEntity.id);
      }
    }
  }

  protected async removeFromIndexes(
    entity: MediaFolder,
    atomic: Deno.AtomicOperation,
  ): Promise<void> {
    atomic.delete(KeyPatterns.folders.byPath(entity.path));

    if (entity.parentId) {
      atomic.delete(KeyPatterns.folders.byParent(entity.parentId));
    } else {
      atomic.delete(KeyPatterns.folders.root());
    }
  }
}

// Export singleton instances
export const mediaRepository = new MediaRepository();
export const mediaFolderRepository = new MediaFolderRepository();
