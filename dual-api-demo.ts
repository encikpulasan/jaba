// Dual API System Demo
// Comprehensive demonstration of REST and GraphQL APIs

import { apiAnalytics } from "@/lib/api/analytics.ts";
import { rateLimitMiddleware } from "@/lib/api/rate-limit.ts";

const BASE_URL = "http://localhost:8000";

console.log("🚀 masmaCMS Dual API System Demo");
console.log("=====================================");

// Demo API Key (you'll need to create this first)
const DEMO_API_KEY = "masa_demo_key_12345"; // Replace with actual key

// Helper function to make authenticated requests
async function makeRequest(
  url: string,
  options: RequestInit = {},
  useApiKey = false,
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  if (useApiKey) {
    headers["Authorization"] = `Bearer ${DEMO_API_KEY}`;
  }

  return fetch(url, {
    ...options,
    headers,
  });
}

// 1. REST API Demonstrations
async function demoRestAPI() {
  console.log("\n📡 REST API Demonstrations");
  console.log("===========================");

  try {
    // 1.1 Get system information
    console.log("\n1. GET System Information");
    const systemResponse = await makeRequest(`${BASE_URL}/api/demo/api-keys`);
    const systemData = await systemResponse.json();
    console.log("Status:", systemResponse.status);
    console.log("Response:", JSON.stringify(systemData, null, 2));

    // 1.2 Create content via REST
    console.log("\n2. POST Create Content");
    const contentData = {
      title: "REST API Demo Article",
      contentType: "blog_post",
      locale: "en",
      content: "This article was created via the REST API!",
      excerpt: "A demo article showcasing REST API capabilities",
      tags: ["demo", "rest", "api"],
      categories: ["tutorials"],
      status: "draft",
      seoTitle: "REST API Demo - masmaCMS",
      seoDescription: "Learn how to use the masmaCMS REST API",
      customFields: {
        author_bio: "API Demo Author",
        reading_time: 5,
      },
    };

    const createResponse = await makeRequest(
      `${BASE_URL}/api/content`,
      {
        method: "POST",
        body: JSON.stringify(contentData),
      },
      true,
    );

    const createdContent = await createResponse.json();
    console.log("Status:", createResponse.status);
    console.log("Response:", JSON.stringify(createdContent, null, 2));

    // 1.3 List content via REST
    console.log("\n3. GET List Content with Filters");
    const listResponse = await makeRequest(
      `${BASE_URL}/api/content?type=blog_post&locale=en&limit=5&sortBy=createdAt&sortOrder=desc`,
      {},
      true,
    );

    const contentList = await listResponse.json();
    console.log("Status:", listResponse.status);
    console.log("Response:", JSON.stringify(contentList, null, 2));

    // 1.4 Upload media via REST
    console.log("\n4. POST Upload Media File");
    // Note: In a real demo, you'd create a FormData with an actual file
    console.log("Media upload would require FormData with actual file");
    console.log("Example: POST /api/media with multipart/form-data");
  } catch (error) {
    console.error("REST API Demo Error:", error);
  }
}

// 2. GraphQL API Demonstrations
async function demoGraphQLAPI() {
  console.log("\n🔀 GraphQL API Demonstrations");
  console.log("==============================");

  try {
    // 2.1 Query system information
    console.log("\n1. GraphQL Query - System Info");
    const systemQuery = {
      query: `
        query SystemInfo {
          systemInfo {
            version
            environment
            features
            limits {
              maxFileSize
              maxApiKeysPerUser
              allowedFileTypes
            }
          }
        }
      `,
    };

    const systemResponse = await makeRequest(
      `${BASE_URL}/api/graphql`,
      {
        method: "POST",
        body: JSON.stringify(systemQuery),
      },
      true,
    );

    const systemResult = await systemResponse.json();
    console.log("Status:", systemResponse.status);
    console.log("Response:", JSON.stringify(systemResult, null, 2));

    // 2.2 Query content with relationships
    console.log("\n2. GraphQL Query - Content with Relationships");
    const contentQuery = {
      query: `
        query GetContents {
          contents(
            filter: { status: PUBLISHED }
            pagination: { limit: 3, sortBy: "createdAt", sortOrder: DESC }
          ) {
            edges {
              node {
                id
                title
                slug
                contentType
                locale
                status
                excerpt
                tags
                categories
                viewCount
                createdAt
                updatedAt
                author {
                  id
                  email
                  firstName
                  lastName
                }
                translations {
                  id
                  locale
                  title
                }
                versions {
                  id
                  versionNumber
                  createdAt
                }
              }
              cursor
            }
            pageInfo {
              hasNextPage
              hasPreviousPage
              startCursor
              endCursor
            }
            totalCount
          }
        }
      `,
    };

    const contentResponse = await makeRequest(
      `${BASE_URL}/api/graphql`,
      {
        method: "POST",
        body: JSON.stringify(contentQuery),
      },
      true,
    );

    const contentResult = await contentResponse.json();
    console.log("Status:", contentResponse.status);
    console.log("Response:", JSON.stringify(contentResult, null, 2));

    // 2.3 Create content mutation
    console.log("\n3. GraphQL Mutation - Create Content");
    const createMutation = {
      query: `
        mutation CreateContent($input: ContentInput!) {
          createContent(input: $input) {
            success
            message
            content {
              id
              title
              slug
              contentType
              locale
              status
              tags
              categories
              createdAt
            }
            errors {
              field
              message
              code
            }
          }
        }
      `,
      variables: {
        input: {
          title: "GraphQL Demo Article",
          contentType: "blog_post",
          locale: "en",
          content: "This article was created via GraphQL mutation!",
          excerpt: "A demo article showcasing GraphQL capabilities",
          tags: ["demo", "graphql", "mutation"],
          categories: ["tutorials"],
          status: "DRAFT",
          seoTitle: "GraphQL Demo - masmaCMS",
          seoDescription: "Learn how to use the masmaCMS GraphQL API",
          customFields: {
            author_bio: "GraphQL Demo Author",
            reading_time: 7,
          },
        },
      },
    };

    const mutationResponse = await makeRequest(
      `${BASE_URL}/api/graphql`,
      {
        method: "POST",
        body: JSON.stringify(createMutation),
      },
      true,
    );

    const mutationResult = await mutationResponse.json();
    console.log("Status:", mutationResponse.status);
    console.log("Response:", JSON.stringify(mutationResult, null, 2));

    // 2.4 Query media with pagination
    console.log("\n4. GraphQL Query - Media with Pagination");
    const mediaQuery = {
      query: `
        query GetMedia {
          medias(
            filter: { type: IMAGE }
            pagination: { limit: 5, sortOrder: DESC }
          ) {
            edges {
              node {
                id
                filename
                originalName
                mimeType
                size
                width
                height
                url
                thumbnailUrl
                alt
                caption
                tags
                usageCount
                uploadedBy {
                  id
                  email
                  firstName
                  lastName
                }
                createdAt
                variants {
                  name
                  url
                  width
                  height
                  format
                }
              }
            }
            pageInfo {
              hasNextPage
              totalCount
            }
          }
        }
      `,
    };

    const mediaResponse = await makeRequest(
      `${BASE_URL}/api/graphql`,
      {
        method: "POST",
        body: JSON.stringify(mediaQuery),
      },
      true,
    );

    const mediaResult = await mediaResponse.json();
    console.log("Status:", mediaResponse.status);
    console.log("Response:", JSON.stringify(mediaResult, null, 2));
  } catch (error) {
    console.error("GraphQL API Demo Error:", error);
  }
}

// 3. API Analytics Demonstration
async function demoAPIAnalytics() {
  console.log("\n📊 API Analytics Demonstration");
  console.log("===============================");

  try {
    // Simulate some API requests for analytics
    console.log("\n1. Generating Sample API Traffic...");

    const endpoints = [
      "/api/content",
      "/api/media",
      "/api/graphql",
      "/api/auth/api-keys",
    ];

    // Generate sample traffic
    for (let i = 0; i < 10; i++) {
      const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
      const statusCode = Math.random() > 0.1 ? 200 : 500; // 90% success rate
      const responseTime = Math.floor(Math.random() * 1000) + 50; // 50-1050ms

      await apiAnalytics.trackRequest({
        id: crypto.randomUUID(),
        endpoint,
        method: "GET",
        statusCode,
        responseTime,
        userAgent: "Demo Client 1.0",
        ipAddress: "127.0.0.1",
        userId: "demo-user-id",
        timestamp: Date.now() - Math.floor(Math.random() * 3600000), // Random time in last hour
      });
    }

    console.log("✅ Generated 10 sample requests");

    // Get analytics data
    console.log("\n2. Retrieving Analytics Data...");
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);

    const analytics = await apiAnalytics.getAnalytics(oneHourAgo, now, "hour");
    console.log("Analytics for last hour:");
    console.log("- Total Requests:", analytics.totalRequests);
    console.log("- Successful Requests:", analytics.successfulRequests);
    console.log("- Error Requests:", analytics.errorRequests);
    console.log(
      "- Average Response Time:",
      analytics.averageResponseTime.toFixed(2),
      "ms",
    );

    console.log("\nTop Endpoints:");
    analytics.topEndpoints.forEach((endpoint, index) => {
      console.log(
        `${index + 1}. ${endpoint.endpoint}: ${endpoint.count} requests (${
          endpoint.averageResponseTime.toFixed(2)
        }ms avg)`,
      );
    });

    console.log("\nStatus Code Breakdown:");
    Object.entries(analytics.statusCodeBreakdown).forEach(([code, count]) => {
      console.log(`- ${code}: ${count} requests`);
    });

    // Get real-time metrics
    console.log("\n3. Real-time Metrics:");
    const realTimeMetrics = await apiAnalytics.getRealTimeMetrics();
    console.log("- Current RPS:", realTimeMetrics.currentRPS.toFixed(2));
    console.log(
      "- Error Rate:",
      realTimeMetrics.currentErrorRate.toFixed(2),
      "%",
    );
    console.log(
      "- Avg Response Time:",
      realTimeMetrics.averageResponseTime.toFixed(2),
      "ms",
    );
  } catch (error) {
    console.error("Analytics Demo Error:", error);
  }
}

// 4. Rate Limiting Demonstration
async function demoRateLimiting() {
  console.log("\n⚡ Rate Limiting Demonstration");
  console.log("==============================");

  try {
    console.log("\n1. Testing Rate Limits...");

    // Make multiple requests to test rate limiting
    const testRequests = [];
    for (let i = 0; i < 5; i++) {
      testRequests.push(
        makeRequest(`${BASE_URL}/api/demo/api-keys`, {}, false),
      );
    }

    const responses = await Promise.all(testRequests);

    console.log("Request Results:");
    responses.forEach((response, index) => {
      console.log(`Request ${index + 1}:`);
      console.log(`- Status: ${response.status}`);
      console.log(`- Rate Limit Headers:`);
      console.log(
        `  - X-RateLimit-Limit: ${response.headers.get("X-RateLimit-Limit")}`,
      );
      console.log(
        `  - X-RateLimit-Remaining: ${
          response.headers.get("X-RateLimit-Remaining")
        }`,
      );
      console.log(`  - Retry-After: ${response.headers.get("Retry-After")}`);
    });

    // Test rate limiting middleware directly
    console.log("\n2. Testing Rate Limiting Middleware...");
    const mockRequest = new Request("http://localhost:8000/api/content", {
      method: "GET",
    });

    const rateLimitResult = await rateLimitMiddleware(mockRequest);
    console.log("Rate Limit Result:");
    console.log("- Allowed:", rateLimitResult.allowed);
    console.log("- Limit:", rateLimitResult.limit);
    console.log("- Remaining:", rateLimitResult.remaining);
    console.log("- Reset Time:", new Date(rateLimitResult.resetTime));
  } catch (error) {
    console.error("Rate Limiting Demo Error:", error);
  }
}

// 5. API Comparison Demo
async function demoAPIComparison() {
  console.log("\n🔄 REST vs GraphQL Comparison");
  console.log("==============================");

  console.log("\n📋 Feature Comparison:");
  console.log("======================");

  const comparison = [
    {
      feature: "Data Fetching",
      rest: "Multiple endpoints, potential over-fetching",
      graphql: "Single endpoint, precise data fetching",
    },
    {
      feature: "Caching",
      rest: "HTTP caching (URL-based)",
      graphql: "Query-based caching (more complex)",
    },
    {
      feature: "Versioning",
      rest: "URL versioning (/api/v1/)",
      graphql: "Schema evolution (deprecation)",
    },
    {
      feature: "File Uploads",
      rest: "Native multipart/form-data support",
      graphql: "Requires multipart spec extension",
    },
    {
      feature: "Error Handling",
      rest: "HTTP status codes",
      graphql: "Structured error responses",
    },
    {
      feature: "Learning Curve",
      rest: "Familiar HTTP concepts",
      graphql: "Requires GraphQL-specific knowledge",
    },
  ];

  comparison.forEach(({ feature, rest, graphql }) => {
    console.log(`\n${feature}:`);
    console.log(`  REST: ${rest}`);
    console.log(`  GraphQL: ${graphql}`);
  });

  console.log("\n🎯 Use Case Recommendations:");
  console.log("=============================");
  console.log("Use REST when:");
  console.log("- Simple CRUD operations");
  console.log("- File uploads/downloads");
  console.log("- HTTP caching is important");
  console.log("- Team familiarity with REST");

  console.log("\nUse GraphQL when:");
  console.log("- Complex data relationships");
  console.log("- Mobile apps (bandwidth optimization)");
  console.log("- Rapid frontend development");
  console.log("- Real-time subscriptions needed");
}

// Main demo runner
async function runDemo() {
  console.log("🎬 Starting Comprehensive API Demo...\n");

  try {
    await demoRestAPI();
    await demoGraphQLAPI();
    await demoAPIAnalytics();
    await demoRateLimiting();
    await demoAPIComparison();

    console.log("\n✅ Demo completed successfully!");
    console.log("\n🌐 API Endpoints Available:");
    console.log("===========================");
    console.log("REST API:");
    console.log("- GET    /api/content");
    console.log("- POST   /api/content");
    console.log("- GET    /api/media");
    console.log("- POST   /api/media");
    console.log("- GET    /api/auth/api-keys");
    console.log("- POST   /api/auth/api-keys");

    console.log("\nGraphQL API:");
    console.log("- POST   /api/graphql");
    console.log("- GET    /api/graphql (GraphiQL playground)");

    console.log("\n📚 Next Steps:");
    console.log("==============");
    console.log(
      "1. Visit http://localhost:8000/api/graphql for GraphiQL playground",
    );
    console.log("2. Create API keys via /api/auth/api-keys");
    console.log("3. Test rate limiting with multiple requests");
    console.log("4. Monitor analytics in real-time");
    console.log("5. Explore both REST and GraphQL capabilities");
  } catch (error) {
    console.error("❌ Demo failed:", error);
  }
}

// Run the demo if this file is executed directly
if (import.meta.main) {
  await runDemo();
}
