import { SearchRequest, SearchResponse, Chunk, Attachment } from "@kb/shared-schemas";

export interface McpToolContext {
  requestId: string;
  tenantId: string;
  libraryId: string;
}

export interface McpToolHandler<Request, Response> {
  name: string;
  handle: (input: Request, ctx: McpToolContext) => Promise<Response>;
}

export type McpSearchHandler = McpToolHandler<SearchRequest, SearchResponse>;

export interface ChunkPreview {
  chunk: Chunk;
  attachments: Attachment[];
  sourceUri: string;
}

export interface RelatedResponse {
  source: ChunkPreview;
  neighbors: ChunkPreview[];
}

export type McpRelatedHandler = McpToolHandler<
  { chunkId: string; limit?: number },
  RelatedResponse
>;

export type McpPreviewHandler = McpToolHandler<{ chunkId: string }, ChunkPreview>;
