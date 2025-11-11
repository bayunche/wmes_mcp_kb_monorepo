import { SearchRequest, SearchResponse, Chunk } from "@kb/shared-schemas";

export interface McpToolContext {
  requestId: string;
  tenantId: string;
}

export interface McpToolHandler<Request, Response> {
  name: string;
  handle: (input: Request, ctx: McpToolContext) => Promise<Response>;
}

export type McpSearchHandler = McpToolHandler<SearchRequest, SearchResponse>;

export interface RelatedResponse {
  source: Chunk;
  neighbors: Chunk[];
}

export type McpRelatedHandler = McpToolHandler<
  { chunkId: string; limit?: number },
  RelatedResponse
>;

export type McpPreviewHandler = McpToolHandler<
  { chunkId: string },
  { chunk: Chunk }
>;
