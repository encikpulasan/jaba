// GraphQL API Endpoint
// Main GraphQL server for masmaCMS

import { createYoga } from "graphql-yoga";
import { typeDefs } from "@/lib/graphql/schema.ts";
import { resolvers } from "@/lib/graphql/resolvers.ts";

// GraphQL Yoga server configuration
const yoga = createYoga({
  schema: {
    typeDefs,
    resolvers,
  },
  graphiql: {
    title: "masmaCMS GraphQL API",
    defaultQuery: `
# Welcome to masmaCMS GraphQL API
# Try querying some content:

query GetContents {
  contents(
    filter: { status: PUBLISHED }
    pagination: { limit: 5 }
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
        createdAt
        updatedAt
      }
    }
    pageInfo {
      hasNextPage
      totalCount
    }
  }
}

# Or get system information:
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

# Create new content:
mutation CreateContent {
  createContent(input: {
    title: "My New Article"
    contentType: "blog_post"
    locale: "en"
    content: "This is the content body..."
    status: DRAFT
    tags: ["example", "api"]
  }) {
    success
    message
    content {
      id
      title
      slug
      status
    }
    errors {
      field
      message
      code
    }
  }
}
    `.trim(),
  },
  context: async ({ request }) => {
    return {
      req: request,
    };
  },
  cors: {
    origin: [
      "http://localhost:8000",
      "http://localhost:3000",
    ],
    credentials: true,
  },
});

// Named exports for Fresh
export const GET = yoga.fetch;
export const POST = yoga.fetch;
export const OPTIONS = yoga.fetch;
