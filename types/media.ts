// Media Types
import type { BaseEntity, Timestamp, UUID } from "./base.ts";

export interface MediaFile extends BaseEntity {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
  url: string;
  thumbnailUrl?: string;
  alt?: string;
  caption?: string;
  folder?: UUID;
  tags: string[];
  metadata: MediaMetadata;
  uploadedBy: UUID;
}

export interface MediaFolder extends BaseEntity {
  name: string;
  parentId?: UUID;
  path: string;
  description?: string;
  permissions: Record<string, string[]>;
}

export interface MediaMetadata {
  exif?: Record<string, unknown>;
  dominantColor?: string;
  blurhash?: string;
  analyzed: boolean;
  processingStatus: "pending" | "processing" | "completed" | "failed";
  variants?: MediaVariant[];
}

export interface MediaVariant {
  name: string;
  url: string;
  width: number;
  height: number;
  size: number;
  format: string;
}
