// Media Service
// Business logic layer for media file management with upload, processing, and permissions

import { mediaFolderRepository, mediaRepository } from "./repository.ts";
import { RBACManager } from "@/lib/auth/rbac.ts";
import type {
  MediaFile,
  MediaFolder,
  MediaMetadata,
  Permission,
  UUID,
} from "@/types";

export interface UploadOptions {
  folder?: UUID;
  alt?: string;
  caption?: string;
  tags?: string[];
  generateThumbnail?: boolean;
  allowedTypes?: string[];
  maxSize?: number; // in bytes
}

export interface MediaUploadResult {
  file: MediaFile;
  thumbnailUrl?: string;
  processingStatus: "pending" | "completed" | "failed";
}

export class MediaService {
  private repository = mediaRepository;
  private folderRepository = mediaFolderRepository;

  // Upload and process media file
  async uploadFile(
    fileData: File | Blob,
    filename: string,
    userId: UUID,
    userPermissions: Permission[],
    options: UploadOptions = {},
  ): Promise<MediaUploadResult> {
    // Check upload permissions
    if (!userPermissions.includes("upload_media")) {
      throw new Error("Insufficient permissions to upload media");
    }

    // Validate file type if restrictions are set
    const mimeType = fileData.type || this.getMimeTypeFromFilename(filename);
    if (options.allowedTypes && !options.allowedTypes.includes(mimeType)) {
      throw new Error(`File type ${mimeType} is not allowed`);
    }

    // Validate file size
    const maxSize = options.maxSize || 50 * 1024 * 1024; // Default 50MB
    if (fileData.size > maxSize) {
      throw new Error(
        `File size exceeds maximum allowed size of ${maxSize} bytes`,
      );
    }

    // Validate folder permissions if specified
    if (options.folder) {
      const folder = await this.folderRepository.findById(options.folder);
      if (!folder) {
        throw new Error("Specified folder not found");
      }

      // Check folder permissions (simplified - in production, check actual folder permissions)
      if (!userPermissions.includes("upload_media")) {
        throw new Error("Insufficient permissions to upload to this folder");
      }
    }

    // Generate unique filename
    const uniqueFilename = await this.generateUniqueFilename(filename);

    // Create file URL (in production, this would save to actual storage)
    const fileUrl = await this.saveFileToStorage(fileData, uniqueFilename);

    // Extract metadata
    const metadata = await this.extractMetadata(fileData, mimeType);

    // Create media record
    const mediaFile = await this.repository.createMediaFile({
      filename: uniqueFilename,
      originalName: filename,
      mimeType,
      size: fileData.size,
      url: fileUrl,
      alt: options.alt,
      caption: options.caption,
      folder: options.folder,
      tags: options.tags || [],
      metadata,
      uploadedBy: userId,
    }, userId);

    // Generate thumbnail if requested and it's an image
    let thumbnailUrl: string | undefined;
    if (options.generateThumbnail && mimeType.startsWith("image/")) {
      thumbnailUrl = await this.generateThumbnail(
        mediaFile.id,
        fileData as File,
      );
    }

    return {
      file: mediaFile,
      thumbnailUrl,
      processingStatus: "completed",
    };
  }

  // Get media file with permissions check
  async getMediaFile(
    id: UUID,
    userId?: UUID,
    userPermissions: Permission[] = [],
  ): Promise<MediaFile | null> {
    const file = await this.repository.findById(id);
    if (!file) {
      return null;
    }

    // Check view permissions
    const canView = userPermissions.includes("view_media") ||
      (userPermissions.includes("view_own_media") &&
        file.uploadedBy === userId);

    if (!canView) {
      return null;
    }

    return file;
  }

  // List media files with filtering
  async listMedia(
    options: {
      folder?: UUID;
      type?: string; // mime type prefix like 'image/', 'video/', 'application/'
      search?: string;
      tags?: string[];
      limit?: number;
      offset?: number;
    } = {},
    userPermissions: Permission[] = [],
  ): Promise<{ files: MediaFile[]; total: number; hasMore: boolean }> {
    let files: MediaFile[] = [];

    // Check permissions
    const canViewAll = userPermissions.includes("view_media");
    const canViewOwn = userPermissions.includes("view_own_media");

    if (!canViewAll && !canViewOwn) {
      return { files: [], total: 0, hasMore: false };
    }

    // Get files based on filters
    if (options.search) {
      files = await this.repository.searchMedia(options.search, {
        mimeTypePrefix: options.type,
        folder: options.folder,
        limit: (options.limit || 20) + 1, // Get one extra to check hasMore
      });
    } else if (options.type) {
      files = await this.repository.findByType(options.type, {
        folder: options.folder,
        limit: (options.limit || 20) + 1,
        offset: options.offset,
      });
    } else if (options.folder) {
      files = await this.repository.findByFolder(options.folder, {
        mimeTypePrefix: options.type,
        limit: (options.limit || 20) + 1,
        offset: options.offset,
      });
    } else {
      const allFiles = await this.repository.findAll();
      files = allFiles.filter((f) => !f.isDeleted);
    }

    // Filter by permissions
    if (!canViewAll) {
      // Only show user's own files
      files = files.filter((f) => f.uploadedBy === userId);
    }

    // Filter by tags if specified
    if (options.tags && options.tags.length > 0) {
      files = files.filter((f) =>
        options.tags!.some((tag) => f.tags.includes(tag))
      );
    }

    // Sort by creation date (newest first)
    files.sort((a, b) => b.createdAt - a.createdAt);

    // Apply pagination
    const limit = options.limit || 20;
    const hasMore = files.length > limit;
    const paginatedFiles = files.slice(0, limit);

    return {
      files: paginatedFiles,
      total: paginatedFiles.length,
      hasMore,
    };
  }

  // Update media metadata
  async updateMediaMetadata(
    id: UUID,
    updates: {
      alt?: string;
      caption?: string;
      tags?: string[];
    },
    userId: UUID,
    userPermissions: Permission[],
  ): Promise<MediaFile> {
    const file = await this.repository.findById(id);
    if (!file) {
      throw new Error("Media file not found");
    }

    // Check edit permissions
    const canEdit = userPermissions.includes("edit_media") ||
      (userPermissions.includes("edit_own_media") &&
        file.uploadedBy === userId);

    if (!canEdit) {
      throw new Error("Insufficient permissions to edit this media file");
    }

    return await this.repository.update(id, updates, userId);
  }

  // Delete media file
  async deleteMediaFile(
    id: UUID,
    userId: UUID,
    userPermissions: Permission[],
  ): Promise<boolean> {
    const file = await this.repository.findById(id);
    if (!file) {
      throw new Error("Media file not found");
    }

    // Check delete permissions
    const canDelete = userPermissions.includes("delete_media") ||
      (userPermissions.includes("delete_own_media") &&
        file.uploadedBy === userId);

    if (!canDelete) {
      throw new Error("Insufficient permissions to delete this media file");
    }

    // Soft delete the file
    const deleted = await this.repository.softDelete(id, userId);

    // In production, also delete the actual file from storage
    if (deleted) {
      await this.deleteFileFromStorage(file.url);

      // Delete thumbnail if exists
      if (file.thumbnailUrl) {
        await this.deleteFileFromStorage(file.thumbnailUrl);
      }
    }

    return deleted;
  }

  // Create media folder
  async createFolder(
    name: string,
    parentId: UUID | undefined,
    userId: UUID,
    userPermissions: Permission[],
    description?: string,
  ): Promise<MediaFolder> {
    // Check permissions
    if (!userPermissions.includes("upload_media")) {
      throw new Error("Insufficient permissions to create folders");
    }

    return await this.folderRepository.createFolder({
      name: name.trim(),
      parentId,
      description,
      permissions: {}, // Default empty permissions
    }, userId);
  }

  // Get folder structure
  async getFolderTree(
    userPermissions: Permission[] = [],
  ): Promise<MediaFolder[]> {
    if (
      !userPermissions.includes("view_media") &&
      !userPermissions.includes("view_own_media")
    ) {
      return [];
    }

    return await this.folderRepository.getFolderTree();
  }

  // Get media analytics
  async getMediaAnalytics(
    userPermissions: Permission[],
  ): Promise<{
    totalFiles: number;
    totalSize: number;
    typeBreakdown: Record<string, number>;
    recentUploads: MediaFile[];
  }> {
    if (!userPermissions.includes("view_media")) {
      throw new Error("Insufficient permissions to view media analytics");
    }

    const allFiles = await this.repository.findAll();
    const activeFiles = allFiles.filter((f) => !f.isDeleted);

    const analytics = {
      totalFiles: activeFiles.length,
      totalSize: activeFiles.reduce((sum, f) => sum + f.size, 0),
      typeBreakdown: {} as Record<string, number>,
      recentUploads: activeFiles
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 10),
    };

    // Calculate type breakdown
    activeFiles.forEach((file) => {
      const typePrefix = file.mimeType.split("/")[0];
      analytics.typeBreakdown[typePrefix] =
        (analytics.typeBreakdown[typePrefix] || 0) + 1;
    });

    return analytics;
  }

  // Helper methods
  private async generateUniqueFilename(
    originalFilename: string,
  ): Promise<string> {
    const ext = originalFilename.split(".").pop() || "";
    const baseName = originalFilename.replace(/\.[^/.]+$/, "");
    const timestamp = Date.now();
    const randomId = crypto.randomUUID().substring(0, 8);

    return `${baseName}-${timestamp}-${randomId}.${ext}`;
  }

  private getMimeTypeFromFilename(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase() || "";

    const mimeTypes: Record<string, string> = {
      "jpg": "image/jpeg",
      "jpeg": "image/jpeg",
      "png": "image/png",
      "gif": "image/gif",
      "webp": "image/webp",
      "svg": "image/svg+xml",
      "mp4": "video/mp4",
      "webm": "video/webm",
      "mp3": "audio/mpeg",
      "wav": "audio/wav",
      "pdf": "application/pdf",
      "doc": "application/msword",
      "docx":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "txt": "text/plain",
      "json": "application/json",
    };

    return mimeTypes[ext] || "application/octet-stream";
  }

  private async saveFileToStorage(
    fileData: File | Blob,
    filename: string,
  ): Promise<string> {
    // In production, this would save to actual storage (S3, local filesystem, etc.)
    // For demo purposes, return a mock URL
    return `/uploads/${filename}`;
  }

  private async deleteFileFromStorage(url: string): Promise<void> {
    // In production, this would delete from actual storage
    console.log(`🗑️ Deleted file from storage: ${url}`);
  }

  private async extractMetadata(
    fileData: File | Blob,
    mimeType: string,
  ): Promise<MediaMetadata> {
    const metadata: MediaMetadata = {
      analyzed: false,
      processingStatus: "pending",
    };

    // For images, extract dimensions
    if (mimeType.startsWith("image/")) {
      try {
        const dimensions = await this.getImageDimensions(fileData);
        metadata.analyzed = true;
        metadata.processingStatus = "completed";
        return {
          ...metadata,
          ...dimensions,
        };
      } catch (error) {
        metadata.processingStatus = "failed";
      }
    }

    return metadata;
  }

  private async getImageDimensions(
    fileData: File | Blob,
  ): Promise<{ width?: number; height?: number }> {
    // In production, this would use proper image processing library
    // For demo, return mock dimensions
    return {
      width: 1920,
      height: 1080,
    };
  }

  private async generateThumbnail(
    mediaId: UUID,
    fileData: File,
  ): Promise<string> {
    // In production, this would generate actual thumbnails
    // For demo, return mock thumbnail URL
    return `/thumbnails/${mediaId}_thumb.jpg`;
  }
}

// Export singleton instance
export const mediaService = new MediaService();
