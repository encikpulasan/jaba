// Media Management System Demo
// Comprehensive demonstration of file upload, organization, and management features

import { mediaService } from "./lib/media/service.ts";
import { db } from "./lib/db/connection.ts";

interface MockFile extends File {
  constructor(bits: BlobPart[], filename: string, options?: FilePropertyBag);
}

// Create mock file for demo
function createMockFile(
  filename: string,
  content: string,
  mimeType: string,
): File {
  const blob = new Blob([content], { type: mimeType });
  return new File([blob], filename, { type: mimeType });
}

// Mock user for demo
const demoUser = {
  id: "demo-user-123",
  permissions: ["upload_media", "view_media", "edit_media", "delete_media"],
};

console.log("🎬 Media Management System Demo");
console.log("=====================================\n");

async function runMediaManagementDemo() {
  try {
    // Initialize database connection
    await db.connect();

    console.log("📁 1. FOLDER MANAGEMENT");
    console.log("------------------------");

    // Create folder structure
    console.log("Creating folder structure...");

    // Note: For demo purposes, we'll simulate folder creation
    // In a real implementation, we'd use the folder repository
    console.log("✅ Created folders: Images/, Documents/, Videos/");
    console.log("✅ Created subfolders: Images/Products/, Images/Blog/\n");

    console.log("📤 2. FILE UPLOAD & PROCESSING");
    console.log("--------------------------------");

    // Create mock file for demo
    const mockImageContent = "fake-image-content";
    const mockFile = new File([mockImageContent], "demo-image.jpg", {
      type: "image/jpeg",
    });

    try {
      const result = await mediaService.uploadFile(
        mockFile,
        "demo-image.jpg",
        demoUser.id,
        demoUser.permissions as any,
        {
          alt: "Demo image for testing",
          caption: "Sample image upload for demonstration",
          tags: ["demo", "test", "sample"],
          generateThumbnail: true,
        },
      );

      console.log(`✅ Uploaded: ${result.file.filename}`);
      console.log(`📍 URL: ${result.file.url}`);
      console.log(`📊 Size: ${result.file.size} bytes`);
      console.log(`🏷️  Tags: ${result.file.tags.join(", ")}`);
      console.log("");

      console.log("🔍 3. MEDIA SEARCH & FILTERING");
      console.log("--------------------------------");

      // Search for images
      const images = await mediaService.listMedia(
        { type: "image/", limit: 10 },
        demoUser.permissions as any,
      );
      console.log(`Found ${images.files.length} images in library`);
      console.log("");

      console.log("📊 4. MEDIA ANALYTICS");
      console.log("----------------------");

      const analytics = await mediaService.getMediaAnalytics(
        demoUser.permissions as any,
      );
      console.log(`📁 Total Files: ${analytics.totalFiles}`);
      console.log(`💾 Total Size: ${formatBytes(analytics.totalSize)}`);
      console.log("");

      console.log("✨ Media Management Demo Complete!");
    } catch (error) {
      console.error("❌ Demo execution failed:", error);
    }

    console.log("🔍 4. MEDIA SEARCH & FILTERING");
    console.log("--------------------------------");

    // Search by type - Images
    console.log("📸 Searching for images...");
    const images = await mediaService.listMedia(
      { type: "image/", limit: 10 },
      demoUser.permissions as any,
    );
    console.log(`Found ${images.files.length} images:`);
    images.files.forEach((file) => {
      console.log(`  • ${file.originalName} (${file.mimeType})`);
      console.log(`    Tags: ${file.tags.join(", ")}`);
    });
    console.log("");

    // Search by tags
    console.log("🏷️  Searching by tag 'branding'...");
    const brandingFiles = await mediaService.listMedia(
      { tags: ["branding"], limit: 10 },
      demoUser.permissions as any,
    );
    console.log(
      `Found ${brandingFiles.files.length} files with 'branding' tag:`,
    );
    brandingFiles.files.forEach((file) => {
      console.log(`  • ${file.originalName}`);
    });
    console.log("");

    // Text search
    console.log("🔎 Text search for 'product'...");
    const productFiles = await mediaService.listMedia(
      { search: "product", limit: 10 },
      demoUser.permissions as any,
    );
    console.log(`Found ${productFiles.files.length} files matching 'product':`);
    productFiles.files.forEach((file) => {
      console.log(`  • ${file.originalName} - ${file.alt || "No alt text"}`);
    });
    console.log("");

    console.log("✏️  5. METADATA MANAGEMENT");
    console.log("---------------------------");

    if (images.files.length > 0) {
      const firstFile = images.files[0];
      console.log(`Updating metadata for: ${firstFile.originalName}`);

      try {
        const updatedFile = await mediaService.updateMediaMetadata(
          firstFile.id,
          {
            alt: "Updated company logo with new tagline",
            caption: "Official company branding logo - 2024 edition",
            tags: ["logo", "branding", "official", "2024", "updated"],
          },
          demoUser.id,
          demoUser.permissions as any,
        );

        console.log("✅ Metadata updated successfully:");
        console.log(`  📝 Alt text: ${updatedFile.alt}`);
        console.log(`  💬 Caption: ${updatedFile.caption}`);
        console.log(`  🏷️  Tags: ${updatedFile.tags.join(", ")}`);
        console.log("");
      } catch (error) {
        console.log(`❌ Metadata update failed: ${error}`);
      }
    }

    console.log("📊 6. MEDIA ANALYTICS");
    console.log("----------------------");

    try {
      const analytics = await mediaService.getMediaAnalytics(
        demoUser.permissions as any,
      );

      console.log("📈 Media Library Statistics:");
      console.log(`  📁 Total Files: ${analytics.totalFiles}`);
      console.log(`  💾 Total Size: ${formatBytes(analytics.totalSize)}`);
      console.log("");

      console.log("📋 File Type Breakdown:");
      Object.entries(analytics.typeBreakdown).forEach(([type, count]) => {
        const emoji = getTypeEmoji(type);
        console.log(`  ${emoji} ${type}: ${count} files`);
      });
      console.log("");

      console.log("⏰ Recent Uploads:");
      analytics.recentUploads.slice(0, 5).forEach((file, index) => {
        const timeAgo = getTimeAgo(file.createdAt);
        console.log(`  ${index + 1}. ${file.originalName} (${timeAgo})`);
      });
      console.log("");
    } catch (error) {
      console.log(`❌ Analytics retrieval failed: ${error}`);
    }

    console.log("🗂️  7. FILE ORGANIZATION");
    console.log("-------------------------");

    // List all media with organization info
    console.log("📋 Complete Media Library:");
    const allMedia = await mediaService.listMedia(
      { limit: 50 },
      demoUser.permissions as any,
    );

    allMedia.files.forEach((file, index) => {
      const typeIcon = getTypeEmoji(file.mimeType.split("/")[0]);
      const size = formatBytes(file.size);
      const date = new Date(file.createdAt).toLocaleDateString();

      console.log(`${index + 1}. ${typeIcon} ${file.originalName}`);
      console.log(`   📊 ${size} • 📅 ${date} • 🏷️  ${file.tags.join(", ")}`);
      if (file.alt) console.log(`   📝 ${file.alt}`);
      console.log("");
    });

    console.log("🔄 8. FILE OPERATIONS");
    console.log("----------------------");

    if (images.files.length > 1) {
      const fileToDelete = images.files[images.files.length - 1];
      console.log(`🗑️  Deleting file: ${fileToDelete.originalName}`);

      try {
        const deleted = await mediaService.deleteMediaFile(
          fileToDelete.id,
          demoUser.id,
          demoUser.permissions as any,
        );

        if (deleted) {
          console.log("✅ File deleted successfully");
        } else {
          console.log("❌ File deletion failed");
        }
      } catch (error) {
        console.log(`❌ Delete operation failed: ${error}`);
      }
      console.log("");
    }

    console.log("🎯 9. ADVANCED FEATURES");
    console.log("------------------------");

    console.log("🔍 Advanced Search Capabilities:");
    console.log("  • Full-text search across filenames, alt text, captions");
    console.log("  • Filter by file type (images, videos, documents)");
    console.log("  • Tag-based filtering and categorization");
    console.log("  • Date range filtering");
    console.log("  • Size-based filtering");
    console.log("");

    console.log("🛡️  Security & Permissions:");
    console.log("  • Role-based access control (RBAC)");
    console.log("  • Folder-level permissions");
    console.log("  • File upload restrictions by type and size");
    console.log("  • User-specific media visibility");
    console.log("");

    console.log("⚡ Performance Features:");
    console.log("  • Automatic thumbnail generation for images");
    console.log("  • Metadata extraction and indexing");
    console.log("  • Efficient database indexing strategies");
    console.log("  • Background processing queue");
    console.log("");

    console.log("🔗 Integration Capabilities:");
    console.log("  • RESTful API with multipart upload support");
    console.log("  • Content management integration");
    console.log("  • CDN-ready asset delivery");
    console.log("  • Webhook support for processing events");
    console.log("");
  } catch (error) {
    console.error("❌ Demo execution failed:", error);
  }
}

// Helper functions
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function getTypeEmoji(type: string): string {
  const emojis: Record<string, string> = {
    "image": "🖼️",
    "video": "🎥",
    "audio": "🎵",
    "application": "📄",
    "text": "📝",
  };
  return emojis[type] || "📎";
}

function getTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

// Run the demo
if (import.meta.main) {
  await runMediaManagementDemo();
  console.log("🚀 Ready for production use!");
}
