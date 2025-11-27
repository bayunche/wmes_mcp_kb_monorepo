import { z } from "zod";

export const TenantIdSchema = z.string().min(1, "tenantId is required");
export const LibraryIdSchema = z.string().min(1, "libraryId is required");

export const TenantConfigSchema = z.object({
  tenantId: TenantIdSchema,
  displayName: z.string().min(1),
  description: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional()
});
export type TenantConfig = z.infer<typeof TenantConfigSchema>;

export const TenantConfigInputSchema = TenantConfigSchema.pick({
  tenantId: true,
  displayName: true,
  description: true
});
export type TenantConfigInput = z.infer<typeof TenantConfigInputSchema>;

export const LibraryConfigSchema = z.object({
  libraryId: LibraryIdSchema,
  tenantId: TenantIdSchema.optional(),
  displayName: z.string().min(1),
  description: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional()
});
export type LibraryConfig = z.infer<typeof LibraryConfigSchema>;

export const LibraryConfigInputSchema = LibraryConfigSchema.pick({
  libraryId: true,
  tenantId: true,
  displayName: true,
  description: true
});
export type LibraryConfigInput = z.infer<typeof LibraryConfigInputSchema>;

export const DocumentStatusSchema = z.enum(["uploaded", "parsed", "indexed", "failed"]);
export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;

export const ContentTypeSchema = z.enum(["text", "table", "image", "caption"]);
export type ContentType = z.infer<typeof ContentTypeSchema>;

export const ModalitySchema = z.enum(["text", "image", "table"]);
export type Modality = z.infer<typeof ModalitySchema>;

export const DocumentSchema = z.object({
  docId: z.string().uuid(),
  title: z.string(),
  sourceUri: z.string().optional(),
  mimeType: z.string().optional(),
  language: z.string().optional(),
  checksum: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  ingestStatus: DocumentStatusSchema.default("uploaded"),
  tenantId: TenantIdSchema.default("default"),
  libraryId: LibraryIdSchema.default("default"),
  tags: z.array(z.string()).optional(),
  errorMessage: z.string().optional(),
  statusMeta: z.unknown().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional()
});
export type Document = z.infer<typeof DocumentSchema>;

export const DocumentSummarySchema = DocumentSchema.pick({
  docId: true,
  title: true,
  sourceUri: true,
  tags: true,
  ingestStatus: true,
  libraryId: true,
  tenantId: true
});
export type DocumentSummary = z.infer<typeof DocumentSummarySchema>;

export const ModelProviderSchema = z.enum(["openai", "ollama", "local"]);
export type ModelProvider = z.infer<typeof ModelProviderSchema>;

export const ModelRoleSchema = z.enum(["embedding", "tagging", "metadata", "ocr", "rerank", "structure"]);
export type ModelRole = z.infer<typeof ModelRoleSchema>;

const ModelSettingBaseSchema = z.object({
  tenantId: TenantIdSchema.default("default"),
  libraryId: LibraryIdSchema.default("default"),
  provider: ModelProviderSchema,
  baseUrl: z.string().min(1),
  modelName: z.string().min(1),
  modelRole: ModelRoleSchema.default("tagging"),
  displayName: z.string().optional(),
  options: z.record(z.string(), z.unknown()).optional()
});

export const ModelSettingInputSchema = ModelSettingBaseSchema.extend({
  apiKey: z.string().min(1).optional()
});
export type ModelSettingInput = z.infer<typeof ModelSettingInputSchema>;

export const ModelSettingSecretSchema = ModelSettingBaseSchema.extend({
  apiKey: z.string().min(1).optional(),
  updatedAt: z.string().datetime().optional()
});
export type ModelSettingSecret = z.infer<typeof ModelSettingSecretSchema>;

export const ModelSettingViewSchema = ModelSettingBaseSchema.extend({
  hasApiKey: z.boolean(),
  apiKeyPreview: z.string().optional(),
  updatedAt: z.string().datetime().optional()
});
export type ModelSettingView = z.infer<typeof ModelSettingViewSchema>;

export const RemoteModelRequestSchema = z.object({
  provider: ModelProviderSchema,
  baseUrl: z.string().min(1),
  apiKey: z.string().optional()
});
export type RemoteModelRequest = z.infer<typeof RemoteModelRequestSchema>;

export const RemoteModelOptionSchema = z.object({
  modelName: z.string(),
  label: z.string().optional(),
  provider: ModelProviderSchema.optional()
});
export type RemoteModelOption = z.infer<typeof RemoteModelOptionSchema>;

export const SemanticEntitySchema = z.object({
  name: z.string(),
  type: z
    .enum(["person", "organization", "product", "location", "concept", "other"])
    .default("other"),
  confidence: z.number().min(0).max(1).optional()
});
export type SemanticEntity = z.infer<typeof SemanticEntitySchema>;

export const SemanticMetadataSchema = z.object({
  title: z.string().max(200).optional(),
  contextSummary: z.string().max(1000).optional(),
  semanticTags: z.array(z.string()).max(12).optional(),
  topics: z.array(z.string()).max(8).optional(),
  keywords: z.array(z.string()).max(16).optional(),
  envLabels: z.array(z.string()).max(8).optional(),
  bizEntities: z.array(z.string()).max(12).optional(),
  entities: z.array(SemanticEntitySchema).optional(),
  parentSectionPath: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).optional(),
  source: z.enum(["llm", "heuristic", "ocr"]).optional(),
  extra: z.record(z.string(), z.unknown()).optional()
});
export type SemanticMetadata = z.infer<typeof SemanticMetadataSchema>;

export const ChunkSchema = z.object({
  chunkId: z.string().uuid(),
  docId: z.string().uuid(),
  hierPath: z.array(z.string()).nonempty(),
  sectionTitle: z.string().optional(),
  semanticTitle: z.string().optional(),
  contentText: z.string().optional(),
  contentType: ContentTypeSchema,
  pageNo: z.number().int().positive().optional(),
  offsetStart: z.number().int().nonnegative().optional(),
  offsetEnd: z.number().int().optional(),
  bbox: z.array(z.number()).length(4).optional(),
  entities: z.record(z.string(), z.unknown()).optional(),
  topicLabels: z.array(z.string()).optional(),
  topics: z.array(z.string()).optional(),
  semanticTags: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  semanticMetadata: SemanticMetadataSchema.optional(),
  envLabels: z.array(z.string()).optional(),
  bizEntities: z.array(z.string()).optional(),
  nerEntities: z.array(SemanticEntitySchema).optional(),
  parentSectionId: z.string().uuid().optional(),
  parentSectionPath: z.array(z.string()).optional(),
  contextSummary: z.string().optional(),
  qualityScore: z.number().optional(),
  createdAt: z.string().datetime().optional()
});
export type Chunk = z.infer<typeof ChunkSchema>;

export const EmbeddingSchema = z.object({
  embId: z.string().uuid(),
  chunkId: z.string().uuid(),
  modality: ModalitySchema,
  modelName: z.string(),
  vector: z.array(z.number()),
  dim: z.number().int().positive(),
  createdAt: z.string().datetime().optional()
});
export type Embedding = z.infer<typeof EmbeddingSchema>;

export const RelationSchema = z.object({
  relationId: z.string().uuid(),
  srcChunkId: z.string().uuid(),
  dstChunkId: z.string().uuid(),
  relType: z.string(),
  weight: z.number().default(0),
  createdAt: z.string().datetime().optional()
});
export type Relation = z.infer<typeof RelationSchema>;

export const DocumentSectionSchema = z.object({
  sectionId: z.string().uuid(),
  docId: z.string().uuid(),
  parentSectionId: z.string().uuid().nullable().optional(),
  title: z.string(),
  summary: z.string().optional(),
  level: z.number().int().positive().default(1),
  path: z.array(z.string()).default([]),
  order: z.number().int().nonnegative().default(0),
  tags: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  createdAt: z.string().datetime().optional()
});
export type DocumentSection = z.infer<typeof DocumentSectionSchema>;

export const AttachmentSchema = z.object({
  assetId: z.string().uuid(),
  docId: z.string().uuid().optional(),
  chunkId: z.string().uuid().optional(),
  assetType: z.enum(["image", "table", "excel_sheet", "slide"]),
  objectKey: z.string(),
  mimeType: z.string(),
  pageNo: z.number().int().positive().optional(),
  bbox: z.array(z.number()).length(4).optional(),
  createdAt: z.string().datetime().optional()
});
export type Attachment = z.infer<typeof AttachmentSchema>;

export const IngestionJobSchema = z.object({
  jobId: z.string().uuid(),
  docId: z.string().uuid().optional(),
  status: z.enum(["pending", "running", "failed", "completed"]),
  errorMessage: z.string().nullish(),
  attempts: z.number().int().nonnegative().default(0),
  tenantId: TenantIdSchema.default("default"),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional()
});
export type IngestionJob = z.infer<typeof IngestionJobSchema>;

export const IngestionTaskSchema = z.object({
  jobId: z.string().uuid(),
  docId: z.string().uuid(),
  tenantId: TenantIdSchema,
  libraryId: LibraryIdSchema.default("default"),
  priority: z.number().int().min(0).max(10).default(5),
  retryCount: z.number().int().nonnegative().default(0),
  traceId: z.string().optional()
});
export type IngestionTask = z.infer<typeof IngestionTaskSchema>;

export const SearchFilterSchema = z.object({
  tenantId: TenantIdSchema.optional(),
  libraryId: LibraryIdSchema.optional(),
  docIds: z.array(z.string().uuid()).optional(),
  topicLabels: z.array(z.string()).optional(),
  hierarchyPrefix: z.array(z.string()).optional(),
  contentTypes: z.array(ContentTypeSchema).optional(),
  attachmentTypes: z.array(AttachmentSchema.shape.assetType).optional(),
  hasAttachments: z.boolean().optional(),
  semanticTags: z.array(z.string()).optional(),
  envLabels: z.array(z.string()).optional(),
  metadataQuery: z.record(z.string(), z.unknown()).optional()
});

export const SearchRequestSchema = z.object({
  query: z.string(),
  limit: z.number().int().positive().max(50).default(10),
  includeNeighbors: z.boolean().default(true),
  filters: SearchFilterSchema.optional()
});
export type SearchRequest = z.infer<typeof SearchRequestSchema>;

export const SearchResultChunkSchema = z.object({
  chunk: ChunkSchema,
  score: z.number(),
  neighbors: z.array(ChunkSchema).optional(),
  attachments: z.array(AttachmentSchema).optional(),
  sourceUri: z.string().optional(),
  document: DocumentSummarySchema.optional()
});

export const SearchResponseSchema = z.object({
  query: z.string(),
  total: z.number().int().nonnegative(),
  results: z.array(SearchResultChunkSchema)
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

export const McpSearchRequestSchema = z.object({
  tool: z.enum(["kb.search", "kb.related", "kb.preview"]),
  arguments: SearchRequestSchema
});
export type McpSearchRequest = z.infer<typeof McpSearchRequestSchema>;

export const McpSearchResponseSchema = z.object({
  context: z.array(
    z.object({
      title: z.string(),
      chunk: ChunkSchema,
      document: DocumentSchema.pick({ docId: true, title: true, sourceUri: true, libraryId: true })
    })
  ),
  total: z.number().int().nonnegative()
});
export type McpSearchResponse = z.infer<typeof McpSearchResponseSchema>;

export const VectorLogSchema = z.object({
  logId: z.string().uuid(),
  chunkId: z.string().uuid().optional(),
  docId: z.string().uuid(),
  tenantId: TenantIdSchema.default("default"),
  libraryId: LibraryIdSchema.default("default"),
  modelRole: ModelRoleSchema,
  provider: z.string(),
  modelName: z.string(),
  driver: z.enum(["local", "remote"]),
  status: z.enum(["success", "failed"]),
  durationMs: z.number().int().nonnegative(),
  vectorDim: z.number().int().positive().optional(),
  inputChars: z.number().int().nonnegative().optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  ocrUsed: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  errorMessage: z.string().optional(),
  createdAt: z.string().datetime().optional()
});
export type VectorLog = z.infer<typeof VectorLogSchema>;

export const IndexingEventSchema = z.object({
  type: z.enum(["document-indexed", "document-failed", "chunk-created"]),
  payload: z.record(z.string(), z.unknown())
});
export type IndexingEvent = z.infer<typeof IndexingEventSchema>;

export const KnowledgeBundleSchema = z.object({
  document: DocumentSchema,
  chunks: z.array(ChunkSchema),
  sections: z.array(DocumentSectionSchema).optional(),
  attachments: z.array(AttachmentSchema).optional(),
  embeddings: z.array(EmbeddingSchema).optional()
});
export type KnowledgeBundle = z.infer<typeof KnowledgeBundleSchema>;
