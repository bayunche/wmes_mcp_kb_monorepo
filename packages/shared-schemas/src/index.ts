import { z } from "zod";

export const TenantIdSchema = z.string().min(1, "tenantId is required");

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
  tags: z.array(z.string()).optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional()
});
export type Document = z.infer<typeof DocumentSchema>;

export const ChunkSchema = z.object({
  chunkId: z.string().uuid(),
  docId: z.string().uuid(),
  hierPath: z.array(z.string()).nonempty(),
  sectionTitle: z.string().optional(),
  contentText: z.string().optional(),
  contentType: ContentTypeSchema,
  pageNo: z.number().int().positive().optional(),
  offsetStart: z.number().int().nonnegative().optional(),
  offsetEnd: z.number().int().optional(),
  bbox: z.array(z.number()).length(4).optional(),
  entities: z.record(z.string(), z.unknown()).optional(),
  topicLabels: z.array(z.string()).optional(),
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
  priority: z.number().int().min(0).max(10).default(5),
  retryCount: z.number().int().nonnegative().default(0),
  traceId: z.string().optional()
});
export type IngestionTask = z.infer<typeof IngestionTaskSchema>;

export const SearchFilterSchema = z.object({
  tenantId: TenantIdSchema.optional(),
  docIds: z.array(z.string().uuid()).optional(),
  topicLabels: z.array(z.string()).optional(),
  hierarchyPrefix: z.array(z.string()).optional()
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
  neighbors: z.array(ChunkSchema).optional()
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
      document: DocumentSchema.pick({ docId: true, title: true, sourceUri: true })
    })
  ),
  total: z.number().int().nonnegative()
});
export type McpSearchResponse = z.infer<typeof McpSearchResponseSchema>;

export const IndexingEventSchema = z.object({
  type: z.enum(["document-indexed", "document-failed", "chunk-created"]),
  payload: z.record(z.string(), z.unknown())
});
export type IndexingEvent = z.infer<typeof IndexingEventSchema>;

export const KnowledgeBundleSchema = z.object({
  document: DocumentSchema,
  chunks: z.array(ChunkSchema),
  attachments: z.array(AttachmentSchema).optional(),
  embeddings: z.array(EmbeddingSchema).optional()
});
export type KnowledgeBundle = z.infer<typeof KnowledgeBundleSchema>;
