// GraphQL Schema Definitions
// Comprehensive schema for masmaCMS GraphQL API

import { buildSchema } from "graphql";

export const typeDefs = `
  # Scalar types
  scalar DateTime
  scalar JSON
  scalar Upload

  # Enums
  enum ContentStatus {
    DRAFT
    PUBLISHED
    ARCHIVED
    SCHEDULED
  }

  enum MediaType {
    IMAGE
    VIDEO
    AUDIO
    DOCUMENT
    OTHER
  }

  enum SortOrder {
    ASC
    DESC
  }

  enum UserRole {
    ADMIN
    EDITOR
    VIEWER
    CUSTOM
  }

  # Base interface
  interface Node {
    id: ID!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  # Content types
  type Content implements Node {
    id: ID!
    title: String!
    slug: String!
    contentType: String!
    locale: String!
    status: ContentStatus!
    content: String
    excerpt: String
    metadata: JSON
    tags: [String!]!
    categories: [String!]!
    author: User!
    publishedAt: DateTime
    scheduledAt: DateTime
    seoTitle: String
    seoDescription: String
    seoKeywords: [String!]
    featuredMedia: MediaFile
    relatedContent: [Content!]
    customFields: JSON
    viewCount: Int!
    createdAt: DateTime!
    updatedAt: DateTime!
    
    # Relationships
    translations: [Content!]!
    versions: [ContentVersion!]!
    comments: [Comment!]!
  }

  type ContentVersion implements Node {
    id: ID!
    content: Content!
    versionNumber: Int!
    title: String!
    content: String
    metadata: JSON
    changes: JSON
    author: User!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  # Media types
  type MediaFile implements Node {
    id: ID!
    filename: String!
    originalName: String!
    mimeType: String!
    size: Int!
    width: Int
    height: Int
    duration: Int
    url: String!
    thumbnailUrl: String
    alt: String
    caption: String
    folder: MediaFolder
    tags: [String!]!
    metadata: JSON
    uploadedBy: User!
    usageCount: Int!
    createdAt: DateTime!
    updatedAt: DateTime!
    
    # Variants for responsive delivery
    variants: [MediaVariant!]!
  }

  type MediaVariant {
    name: String!
    url: String!
    width: Int!
    height: Int!
    size: Int!
    format: String!
  }

  type MediaFolder implements Node {
    id: ID!
    name: String!
    path: String!
    description: String
    parentId: ID
    parent: MediaFolder
    children: [MediaFolder!]!
    files: [MediaFile!]!
    permissions: JSON
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  # User and authentication types
  type User implements Node {
    id: ID!
    email: String!
    username: String
    firstName: String
    lastName: String
    avatar: MediaFile
    bio: String
    locale: String!
    timezone: String
    emailVerified: Boolean!
    isActive: Boolean!
    lastLoginAt: DateTime
    roles: [Role!]!
    permissions: [String!]!
    teams: [Team!]!
    createdContent: [Content!]!
    uploadedMedia: [MediaFile!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Role implements Node {
    id: ID!
    name: String!
    description: String
    permissions: [String!]!
    isSystemRole: Boolean!
    userCount: Int!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Team implements Node {
    id: ID!
    name: String!
    description: String
    slug: String!
    avatar: MediaFile
    members: [TeamMember!]!
    permissions: JSON
    settings: JSON
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type TeamMember {
    user: User!
    role: String!
    joinedAt: DateTime!
    permissions: [String!]!
  }

  # API Key types
  type ApiKey implements Node {
    id: ID!
    name: String!
    prefix: String!
    permissions: [String!]!
    scopes: [String!]
    environment: String
    isActive: Boolean!
    expiresAt: DateTime
    lastUsedAt: DateTime
    usageCount: Int!
    rateLimit: RateLimitConfig
    ipWhitelist: [String!]
    metadata: JSON
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type RateLimitConfig {
    requests: Int!
    window: Int!
    burst: Int
  }

  # Comment and interaction types
  type Comment implements Node {
    id: ID!
    content: Content!
    author: User!
    body: String!
    status: String!
    parentId: ID
    parent: Comment
    replies: [Comment!]!
    metadata: JSON
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  # Analytics types
  type ContentAnalytics {
    content: Content!
    views: Int!
    uniqueViews: Int!
    avgTimeOnPage: Float
    bounceRate: Float
    referrers: [ReferrerStats!]!
    countries: [CountryStats!]!
    devices: [DeviceStats!]!
    timeRange: TimeRange!
  }

  type ReferrerStats {
    referrer: String!
    views: Int!
    percentage: Float!
  }

  type CountryStats {
    country: String!
    views: Int!
    percentage: Float!
  }

  type DeviceStats {
    device: String!
    views: Int!
    percentage: Float!
  }

  type TimeRange {
    start: DateTime!
    end: DateTime!
  }

  type MediaAnalytics {
    totalFiles: Int!
    totalSize: Int!
    typeBreakdown: [MediaTypeStats!]!
    recentUploads: [MediaFile!]!
    topFiles: [MediaUsageStats!]!
  }

  type MediaTypeStats {
    type: String!
    count: Int!
    totalSize: Int!
    percentage: Float!
  }

  type MediaUsageStats {
    file: MediaFile!
    usageCount: Int!
    lastUsed: DateTime
  }

  # Input types
  input ContentInput {
    title: String!
    slug: String
    contentType: String!
    locale: String!
    content: String
    excerpt: String
    metadata: JSON
    tags: [String!]
    categories: [String!]
    status: ContentStatus
    publishedAt: DateTime
    scheduledAt: DateTime
    seoTitle: String
    seoDescription: String
    seoKeywords: [String!]
    featuredMediaId: ID
    customFields: JSON
  }

  input ContentUpdateInput {
    title: String
    slug: String
    content: String
    excerpt: String
    metadata: JSON
    tags: [String!]
    categories: [String!]
    status: ContentStatus
    publishedAt: DateTime
    scheduledAt: DateTime
    seoTitle: String
    seoDescription: String
    seoKeywords: [String!]
    featuredMediaId: ID
    customFields: JSON
  }

  input ContentFilterInput {
    contentType: String
    locale: String
    status: ContentStatus
    author: ID
    tags: [String!]
    categories: [String!]
    search: String
    dateRange: DateRangeInput
  }

  input MediaFilterInput {
    type: MediaType
    folder: ID
    tags: [String!]
    search: String
    mimeType: String
    sizeRange: SizeRangeInput
    dateRange: DateRangeInput
  }

  input DateRangeInput {
    start: DateTime
    end: DateTime
  }

  input SizeRangeInput {
    min: Int
    max: Int
  }

  input PaginationInput {
    limit: Int = 20
    offset: Int = 0
    sortBy: String = "createdAt"
    sortOrder: SortOrder = DESC
  }

  input ApiKeyInput {
    name: String!
    permissions: [String!]!
    scopes: [String!]
    environment: String
    expiresAt: DateTime
    rateLimit: RateLimitInput
    ipWhitelist: [String!]
    metadata: JSON
  }

  input RateLimitInput {
    requests: Int!
    window: Int!
    burst: Int
  }

  # Connection types for pagination
  type ContentConnection {
    edges: [ContentEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type ContentEdge {
    node: Content!
    cursor: String!
  }

  type MediaConnection {
    edges: [MediaEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type MediaEdge {
    node: MediaFile!
    cursor: String!
  }

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }

  # Mutation responses
  type ContentMutationResponse {
    success: Boolean!
    message: String
    content: Content
    errors: [MutationError!]
  }

  type MediaMutationResponse {
    success: Boolean!
    message: String
    media: MediaFile
    errors: [MutationError!]
  }

  type ApiKeyMutationResponse {
    success: Boolean!
    message: String
    apiKey: ApiKey
    plainKey: String
    errors: [MutationError!]
  }

  type MutationError {
    field: String!
    message: String!
    code: String
  }

  # Root types
  type Query {
    # Content queries
    content(id: ID!): Content
    contents(
      filter: ContentFilterInput
      pagination: PaginationInput
    ): ContentConnection!
    
    contentBySlug(slug: String!, locale: String!): Content
    contentVersions(contentId: ID!): [ContentVersion!]!
    
    # Media queries
    media(id: ID!): MediaFile
    medias(
      filter: MediaFilterInput
      pagination: PaginationInput
    ): MediaConnection!
    
    mediaFolder(id: ID!): MediaFolder
    mediaFolders(parentId: ID): [MediaFolder!]!
    mediaFolderTree: [MediaFolder!]!
    
    # User queries
    user(id: ID!): User
    users(
      filter: JSON
      pagination: PaginationInput
    ): [User!]!
    
    currentUser: User
    
    # API Key queries
    apiKey(id: ID!): ApiKey
    apiKeys: [ApiKey!]!
    
    # Analytics queries
    contentAnalytics(
      contentId: ID!
      timeRange: DateRangeInput!
    ): ContentAnalytics
    
    mediaAnalytics(
      timeRange: DateRangeInput
    ): MediaAnalytics!
    
    # System queries
    systemInfo: SystemInfo!
  }

  type Mutation {
    # Content mutations
    createContent(input: ContentInput!): ContentMutationResponse!
    updateContent(id: ID!, input: ContentUpdateInput!): ContentMutationResponse!
    deleteContent(id: ID!): ContentMutationResponse!
    publishContent(id: ID!): ContentMutationResponse!
    unpublishContent(id: ID!): ContentMutationResponse!
    duplicateContent(id: ID!, locale: String): ContentMutationResponse!
    
    # Media mutations
    uploadMedia(
      file: Upload!
      alt: String
      caption: String
      tags: [String!]
      folderId: ID
    ): MediaMutationResponse!
    
    updateMedia(
      id: ID!
      alt: String
      caption: String
      tags: [String!]
      folderId: ID
    ): MediaMutationResponse!
    
    deleteMedia(id: ID!): MediaMutationResponse!
    
    createMediaFolder(
      name: String!
      parentId: ID
      description: String
    ): MediaMutationResponse!
    
    # API Key mutations
    createApiKey(input: ApiKeyInput!): ApiKeyMutationResponse!
    updateApiKey(id: ID!, input: ApiKeyInput!): ApiKeyMutationResponse!
    revokeApiKey(id: ID!): ApiKeyMutationResponse!
  }

  type Subscription {
    # Real-time content updates
    contentUpdated(contentId: ID): Content!
    contentCreated(contentType: String, locale: String): Content!
    contentDeleted: ID!
    
    # Real-time media updates
    mediaUploaded: MediaFile!
    mediaUpdated(mediaId: ID): MediaFile!
    mediaDeleted: ID!
    
    # Real-time analytics
    analyticsUpdated(contentId: ID): ContentAnalytics!
  }

  type SystemInfo {
    version: String!
    environment: String!
    features: [String!]!
    limits: SystemLimits!
  }

  type SystemLimits {
    maxFileSize: Int!
    maxApiKeysPerUser: Int!
    maxContentPerUser: Int!
    allowedFileTypes: [String!]!
  }
`;

// Build and export the GraphQL schema
export const schema = buildSchema(typeDefs);
