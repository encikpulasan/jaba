// Content Management System Demo
// Demonstrates all major CMS features including content creation, management, and retrieval

import { contentService } from "./lib/content/service.ts";
import { RBACManager } from "./lib/auth/rbac.ts";
import type { Content, Permission, UUID } from "./types/mod.ts";

console.log("🎯 Content Management System Demo\n");

async function runDemo() {
  try {
    // Mock user ID and permissions for demo
    const userId = "demo-user-123" as UUID;
    const adminPermissions: Permission[] = [
      "create_content",
      "edit_content", 
      "publish_content",
      "view_content",
      "view_unpublished_content"
    ];

    // 1. Create different types of content
    console.log("1. Creating Content...");
    
    const blogPost = await contentService.createContent({
      title: "Welcome to masmaCMS",
      body: "# Welcome to masmaCMS\n\nThis is a powerful headless CMS built with Deno and Fresh.",
      contentType: "blog_post",
      locale: "en",
      status: "draft",
      tags: ["cms", "deno", "typescript"],
      categories: ["Technology", "Web Development"],
      seoTitle: "Welcome to masmaCMS - Headless CMS",
      seoDescription: "Discover the power of masmaCMS, a modern headless CMS",
      seoKeywords: ["cms", "headless", "deno", "typescript"],
      fields: {
        featured: true,
        readingTime: 5,
        author: "John Doe"
      }
    }, userId, adminPermissions);
    
    console.log(`✅ Created blog post: "${blogPost.title}" (ID: ${blogPost.id})`);

    const landingPage = await contentService.createContent({
      title: "Home Page",
      body: "Welcome to our amazing website! This is the home page content.",
      contentType: "page",
      locale: "en", 
      status: "draft",
      tags: ["home", "landing"],
      categories: ["Pages"],
      fields: {
        heroTitle: "Build Amazing Websites",
        heroSubtitle: "With masmaCMS",
        ctaText: "Get Started"
      }
    }, userId, adminPermissions);

    console.log(`✅ Created landing page: "${landingPage.title}" (ID: ${landingPage.id})`);

    // 2. Publish content
    console.log("\n2. Publishing Content...");
    
    const publishedBlog = await contentService.publishContent(
      blogPost.id,
      userId,
      adminPermissions
    );
    
    console.log(`✅ Published: "${publishedBlog.title}" - Status: ${publishedBlog.status}`);

    // 3. Retrieve content by slug
    console.log("\n3. Retrieving Content by Slug...");
    
    const foundContent = await contentService.getContentBySlug(
      publishedBlog.slug,
      "en",
      userId,
      adminPermissions
    );
    
    if (foundContent) {
      console.log(`✅ Found content: "${foundContent.title}"`);
      console.log(`   📊 Views: ${foundContent.viewCount}`);
      console.log(`   🏷️  Tags: ${foundContent.tags.join(", ")}`);
      console.log(`   📂 Categories: ${foundContent.categories.join(", ")}`);
    }

    // 4. List content with filters
    console.log("\n4. Listing Content with Filters...");
    
    const blogPosts = await contentService.listContent({
      contentType: "blog_post",
      status: "published",
      limit: 10
    }, adminPermissions);
    
    console.log(`✅ Found ${blogPosts.content.length} published blog posts:`);
    blogPosts.content.forEach(post => {
      console.log(`   - "${post.title}" (${post.status})`);
    });

    // 5. Search content
    console.log("\n5. Searching Content...");
    
    const searchResults = await contentService.searchContent(
      "masmaCMS",
      { contentType: "blog_post", limit: 5 },
      adminPermissions
    );
    
    console.log(`✅ Search found ${searchResults.length} results for "masmaCMS":`);
    searchResults.forEach(result => {
      console.log(`   - "${result.title}" - Score: High relevance`);
    });

    // 6. Create multilingual content
    console.log("\n6. Creating Multilingual Content...");
    
    const spanishPost = await contentService.createContent({
      title: "Bienvenido a masmaCMS",
      body: "# Bienvenido a masmaCMS\n\nEste es un CMS headless poderoso construido con Deno y Fresh.",
      contentType: "blog_post",
      locale: "es",
      status: "draft",
      tags: ["cms", "deno", "typescript"],
      categories: ["Tecnología", "Desarrollo Web"],
      seoTitle: "Bienvenido a masmaCMS - CMS Headless",
      seoDescription: "Descubre el poder de masmaCMS, un CMS headless moderno",
      fields: {
        featured: true,
        readingTime: 5,
        author: "Juan Pérez"
      }
    }, userId, adminPermissions);
    
    console.log(`✅ Created Spanish content: "${spanishPost.title}" (${spanishPost.locale})`);

    // 7. Demonstrate content relationships  
    console.log("\n7. Creating Related Content...");
    
    const relatedPost = await contentService.createContent({
      title: "Advanced masmaCMS Features",
      body: "Learn about the advanced features of masmaCMS including workflows and permissions.",
      contentType: "blog_post", 
      locale: "en",
      status: "draft",
      tags: ["cms", "advanced", "features"],
      categories: ["Technology", "Tutorials"],
      relatedContent: [blogPost.id], // Link to the first blog post
      fields: {
        difficulty: "intermediate",
        readingTime: 8
      }
    }, userId, adminPermissions);
    
    console.log(`✅ Created related post: "${relatedPost.title}"`);
    console.log(`   🔗 Related to: "${blogPost.title}"`);

    // 8. Content Analytics Summary
    console.log("\n8. Content Analytics Summary...");
    
    const allContent = await contentService.listContent({
      limit: 100
    }, adminPermissions);
    
    const stats = {
      total: allContent.content.length,
      published: allContent.content.filter(c => c.status === "published").length,
      drafts: allContent.content.filter(c => c.status === "draft").length,
      locales: [...new Set(allContent.content.map(c => c.locale))],
      contentTypes: [...new Set(allContent.content.map(c => c.contentType))],
      totalViews: allContent.content.reduce((sum, c) => sum + c.viewCount, 0)
    };
    
    console.log("📊 Content Analytics:");
    console.log(`   📄 Total Content: ${stats.total}`);
    console.log(`   ✅ Published: ${stats.published}`);
    console.log(`   📝 Drafts: ${stats.drafts}`);
    console.log(`   🌍 Locales: ${stats.locales.join(", ")}`);
    console.log(`   📂 Content Types: ${stats.contentTypes.join(", ")}`);
    console.log(`   👀 Total Views: ${stats.totalViews}`);

    console.log("\n🎉 Content Management System Demo Complete!");
    console.log("\n🔥 Key Features Demonstrated:");
    console.log("   ✅ Content Creation & Management");
    console.log("   ✅ Publishing Workflow");
    console.log("   ✅ Content Retrieval by Slug");
    console.log("   ✅ Advanced Filtering & Search");
    console.log("   ✅ Multilingual Content Support");
    console.log("   ✅ Content Relationships");
    console.log("   ✅ SEO Optimization");
    console.log("   ✅ Custom Fields & Metadata");
    console.log("   ✅ View Tracking");
    console.log("   ✅ Permission-based Access Control");

  } catch (error) {
    console.error("❌ Demo failed:", error);
    console.error("\nNote: This demo showcases the CMS architecture and features.");
    console.error("Some functions may need database setup to work fully.");
  }
}

// Run the demo
if (import.meta.main) {
  await runDemo();
} 