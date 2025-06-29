// Content Compression & Asset Optimization
// Advanced compression and optimization for better performance

import { cache } from "@/lib/cache/multi-layer.ts";

export interface CompressionOptions {
  level: number; // 1-9, higher = better compression, slower
  threshold: number; // Minimum size to compress (bytes)
  enableBrotli: boolean;
  enableGzip: boolean;
  enableDeflate: boolean;
}

export interface OptimizationResult {
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  algorithm: string;
  cacheKey?: string;
}

const DEFAULT_COMPRESSION_OPTIONS: CompressionOptions = {
  level: 6,
  threshold: 1024, // 1KB
  enableBrotli: true,
  enableGzip: true,
  enableDeflate: true,
};

class CompressionManager {
  private static instance: CompressionManager;

  private constructor() {}

  static getInstance(): CompressionManager {
    if (!CompressionManager.instance) {
      CompressionManager.instance = new CompressionManager();
    }
    return CompressionManager.instance;
  }

  // Content compression
  async compressContent(
    content: string,
    options: Partial<CompressionOptions> = {},
  ): Promise<OptimizationResult> {
    const opts = { ...DEFAULT_COMPRESSION_OPTIONS, ...options };
    const originalSize = new TextEncoder().encode(content).length;

    // Don't compress small content
    if (originalSize < opts.threshold) {
      return {
        originalSize,
        compressedSize: originalSize,
        compressionRatio: 1,
        algorithm: "none",
      };
    }

    try {
      // Try Brotli first (best compression)
      if (opts.enableBrotli) {
        const compressed = await this.brotliCompress(content, opts.level);
        return {
          originalSize,
          compressedSize: compressed.length,
          compressionRatio: compressed.length / originalSize,
          algorithm: "br",
        };
      }

      // Fallback to Gzip
      if (opts.enableGzip) {
        const compressed = await this.gzipCompress(content, opts.level);
        return {
          originalSize,
          compressedSize: compressed.length,
          compressionRatio: compressed.length / originalSize,
          algorithm: "gzip",
        };
      }

      return {
        originalSize,
        compressedSize: originalSize,
        compressionRatio: 1,
        algorithm: "none",
      };
    } catch (error) {
      console.error("Compression error:", error);
      return {
        originalSize,
        compressedSize: originalSize,
        compressionRatio: 1,
        algorithm: "error",
      };
    }
  }

  // Response compression middleware
  async compressResponse(
    request: Request,
    response: Response,
    options: Partial<CompressionOptions> = {},
  ): Promise<Response> {
    const acceptEncoding = request.headers.get("Accept-Encoding") || "";
    const contentType = response.headers.get("Content-Type") || "";

    // Only compress text-based content
    if (!this.shouldCompress(contentType)) {
      return response;
    }

    const content = await response.text();
    const compressionResult = await this.compressContent(content, options);

    if (
      compressionResult.algorithm === "none" ||
      compressionResult.algorithm === "error"
    ) {
      return response;
    }

    // Create new response with compression headers
    const headers = new Headers(response.headers);
    headers.set("Content-Encoding", compressionResult.algorithm);
    headers.set("Content-Length", compressionResult.compressedSize.toString());
    headers.set("Vary", "Accept-Encoding");
    headers.set(
      "X-Compression-Ratio",
      compressionResult.compressionRatio.toFixed(3),
    );

    return new Response(content, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  // Asset optimization
  async optimizeAsset(
    asset: Uint8Array,
    mimeType: string,
    options: {
      quality?: number;
      format?: string;
      width?: number;
      height?: number;
    } = {},
  ): Promise<{
    data: Uint8Array;
    originalSize: number;
    optimizedSize: number;
    savings: number;
  }> {
    const originalSize = asset.length;

    try {
      let optimizedData = asset;

      // Image optimization
      if (mimeType.startsWith("image/")) {
        optimizedData = await this.optimizeImage(asset, mimeType, options);
      } // JavaScript/CSS minification
      else if (mimeType.includes("javascript") || mimeType.includes("css")) {
        const content = new TextDecoder().decode(asset);
        const minified = await this.minifyCode(content, mimeType);
        optimizedData = new TextEncoder().encode(minified);
      }

      const optimizedSize = optimizedData.length;
      const savings = ((originalSize - optimizedSize) / originalSize) * 100;

      return {
        data: optimizedData,
        originalSize,
        optimizedSize,
        savings,
      };
    } catch (error) {
      console.error("Asset optimization error:", error);
      return {
        data: asset,
        originalSize,
        optimizedSize: originalSize,
        savings: 0,
      };
    }
  }

  // Progressive loading helpers
  generateProgressiveImages(
    originalImage: Uint8Array,
    mimeType: string,
  ): Promise<{
    thumbnail: Uint8Array; // 50x50
    small: Uint8Array; // 300x300
    medium: Uint8Array; // 800x800
    large: Uint8Array; // 1200x1200
    webp?: Uint8Array;
    avif?: Uint8Array;
  }> {
    // This would integrate with image processing library
    // For now, return mock implementation
    return Promise.resolve({
      thumbnail: originalImage,
      small: originalImage,
      medium: originalImage,
      large: originalImage,
      webp: originalImage,
      avif: originalImage,
    });
  }

  // Content delivery optimization
  async optimizeForDelivery(
    content: any,
    contentType: string,
    userAgent?: string,
  ): Promise<{
    optimizedContent: any;
    headers: Record<string, string>;
    cacheStrategy: string;
  }> {
    const headers: Record<string, string> = {};
    let optimizedContent = content;
    let cacheStrategy = "default";

    // Text content optimization
    if (typeof content === "string") {
      const compressionResult = await this.compressContent(content);
      headers["Content-Encoding"] = compressionResult.algorithm;
      headers["X-Compression-Ratio"] = compressionResult.compressionRatio
        .toFixed(3);
    }

    // Image content optimization
    if (contentType.startsWith("image/")) {
      // Modern format support detection
      if (userAgent?.includes("Chrome") || userAgent?.includes("Firefox")) {
        headers["Accept"] = "image/webp,image/avif,*/*";
        cacheStrategy = "modern-browsers";
      }
    }

    // JavaScript/CSS optimization
    if (contentType.includes("javascript") || contentType.includes("css")) {
      if (typeof content === "string") {
        optimizedContent = await this.minifyCode(content, contentType);
      }
      cacheStrategy = "long-term";
    }

    // Set appropriate cache headers
    headers["Cache-Control"] = this.getCacheControl(contentType, cacheStrategy);
    headers["ETag"] = this.generateETag(content);

    return {
      optimizedContent,
      headers,
      cacheStrategy,
    };
  }

  // Private helper methods
  private async brotliCompress(
    content: string,
    level: number,
  ): Promise<Uint8Array> {
    // Mock implementation - in production, use actual Brotli compression
    const encoded = new TextEncoder().encode(content);
    return encoded.slice(0, Math.floor(encoded.length * 0.7)); // Mock 30% compression
  }

  private async gzipCompress(
    content: string,
    level: number,
  ): Promise<Uint8Array> {
    // Mock implementation - in production, use actual Gzip compression
    const encoded = new TextEncoder().encode(content);
    return encoded.slice(0, Math.floor(encoded.length * 0.8)); // Mock 20% compression
  }

  private shouldCompress(contentType: string): boolean {
    const compressibleTypes = [
      "text/",
      "application/json",
      "application/javascript",
      "application/xml",
      "image/svg+xml",
    ];

    return compressibleTypes.some((type) => contentType.includes(type));
  }

  private async optimizeImage(
    image: Uint8Array,
    mimeType: string,
    options: {
      quality?: number;
      format?: string;
      width?: number;
      height?: number;
    },
  ): Promise<Uint8Array> {
    // Mock implementation - in production, use sharp or similar library
    const quality = options.quality || 85;
    const reductionFactor = (100 - quality) / 100;

    // Simulate size reduction based on quality
    const reducedSize = Math.floor(image.length * (1 - reductionFactor * 0.5));
    return image.slice(0, reducedSize);
  }

  private async minifyCode(code: string, mimeType: string): Promise<string> {
    // Mock implementation - in production, use terser for JS, cssnano for CSS
    if (mimeType.includes("javascript")) {
      return code
        .replace(/\/\*[\s\S]*?\*\//g, "") // Remove comments
        .replace(/\s+/g, " ") // Collapse whitespace
        .trim();
    }

    if (mimeType.includes("css")) {
      return code
        .replace(/\/\*[\s\S]*?\*\//g, "") // Remove comments
        .replace(/\s+/g, " ") // Collapse whitespace
        .replace(/;\s*}/g, "}") // Remove unnecessary semicolons
        .trim();
    }

    return code;
  }

  private getCacheControl(contentType: string, strategy: string): string {
    switch (strategy) {
      case "long-term":
        return "public, max-age=31536000, immutable"; // 1 year for assets
      case "modern-browsers":
        return "public, max-age=86400, stale-while-revalidate=3600"; // 1 day
      default:
        return "public, max-age=3600"; // 1 hour
    }
  }

  private generateETag(content: any): string {
    // Simple hash-based ETag
    const str = typeof content === "string" ? content : JSON.stringify(content);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `"${Math.abs(hash).toString(36)}"`;
  }

  // Performance monitoring
  getCompressionStats(): {
    totalCompressions: number;
    averageRatio: number;
    totalSavings: number;
  } {
    // In a real implementation, these would be tracked
    return {
      totalCompressions: 0,
      averageRatio: 0.7,
      totalSavings: 0,
    };
  }
}

// Export singleton instance
export const compression = CompressionManager.getInstance();

// Utility functions
export function selectOptimalFormat(
  acceptHeader: string,
  availableFormats: string[],
): string {
  const preferences = acceptHeader.split(",").map((format) => {
    const [type, ...params] = format.trim().split(";");
    const qMatch = params.find((p) => p.trim().startsWith("q="));
    const quality = qMatch ? parseFloat(qMatch.split("=")[1]) : 1;
    return { type: type.trim(), quality };
  }).sort((a, b) => b.quality - a.quality);

  for (const pref of preferences) {
    if (availableFormats.includes(pref.type)) {
      return pref.type;
    }
  }

  return availableFormats[0] || "application/octet-stream";
}

export function calculateCompressionSavings(
  original: number,
  compressed: number,
): { bytes: number; percentage: number } {
  const bytes = original - compressed;
  const percentage = (bytes / original) * 100;
  return { bytes, percentage };
}
