import { HybridRetriever, InMemoryChunkRepository, ChunkRecord } from "../../../packages/core/src/retrieval";
import { VectorClient } from "../../../packages/core/src/vector";
import { McpServer } from "./server";
import { InMemoryMcpRepository } from "./repository/in-memory";
import { createSearchTool } from "./tools/search";
import { createRelatedTool } from "./tools/related";
import { createPreviewTool } from "./tools/preview";
import { McpToolContext } from "./types";

export interface CreateMcpServerOptions {
  data: ChunkRecord[];
  vectorClient?: VectorClient;
}

export function createMcpServer(options: CreateMcpServerOptions) {
  const vectorClient = options.vectorClient ?? new VectorClient();
  const chunkRepo = new InMemoryChunkRepository(options.data);
  const retriever = new HybridRetriever({
    vectorClient,
    repo: chunkRepo
  });

  const mcpRepo = new InMemoryMcpRepository(options.data);
  const server = new McpServer();
  server.registerTool("kb.search", (input, ctx) => createSearchTool(retriever).handle(input, ctx));
  server.registerTool("kb.related", (input, ctx) => createRelatedTool(mcpRepo).handle(input, ctx));
  server.registerTool("kb.preview", (input, ctx) => createPreviewTool(mcpRepo).handle(input, ctx));
  return server;
}

export async function handleMcpRequest(
  server: McpServer,
  tool: string,
  input: unknown,
  context: McpToolContext
) {
  return server.handle(tool, input, context);
}
