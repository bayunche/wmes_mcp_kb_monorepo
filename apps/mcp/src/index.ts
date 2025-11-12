import { HybridRetriever, ChunkRepository } from "../../../packages/core/src/retrieval";
import { VectorClient } from "../../../packages/core/src/vector";
import { McpServer } from "./server";
import { DbMcpRepository } from "./repository/db";
import { createSearchTool } from "./tools/search";
import { createRelatedTool } from "./tools/related";
import { createPreviewTool } from "./tools/preview";
import { McpToolContext } from "./types";
import { createDataLayer, DataLayer, AttachmentRepository } from "@kb/data";
import { loadConfig, AppConfig } from "../../../packages/core/src/config";

export interface CreateMcpServerOptions {
  vectorClient?: VectorClient;
  dataLayer?: DataLayer;
  config?: AppConfig;
  chunkRepository?: ChunkRepository;
  attachments?: AttachmentRepository;
}

export function createMcpServer(options: CreateMcpServerOptions = {}) {
  const config = options.config ?? loadConfig();
  const dataLayer =
    options.chunkRepository ? options.dataLayer : options.dataLayer ?? createDataLayer(config);
  const chunks = options.chunkRepository ?? dataLayer?.chunks;
  if (!chunks) {
    throw new Error("Chunk repository is required to start MCP server");
  }
  const vectorClient =
    options.vectorClient ??
    new VectorClient({
      textEndpoint: config.TEXT_EMBEDDING_ENDPOINT,
      rerankEndpoint: config.RERANK_ENDPOINT,
      imageEndpoint: config.IMAGE_EMBEDDING_ENDPOINT,
      apiKey: config.VECTOR_API_KEY,
      fallbackDim: config.PGVECTOR_DIM,
      enableLocalModels: config.LOCAL_EMBEDDING_ENABLED,
      localTextModelId: config.LOCAL_TEXT_MODEL_ID ?? undefined,
      localImageModelId: config.LOCAL_IMAGE_MODEL_ID ?? undefined,
      modelCacheDir: config.MODELS_DIR
    });
  const retriever = new HybridRetriever({
    vectorClient,
    repo: chunks
  });

  const attachmentRepo = options.attachments ?? dataLayer?.attachments;
  if (!attachmentRepo) {
    throw new Error("Attachment repository is required to start MCP server");
  }
  const mcpRepo = new DbMcpRepository(chunks, attachmentRepo);
  const server = new McpServer();
  server.registerTool("kb.search", (input, ctx) =>
    createSearchTool(retriever, mcpRepo).handle(input, ctx)
  );
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
