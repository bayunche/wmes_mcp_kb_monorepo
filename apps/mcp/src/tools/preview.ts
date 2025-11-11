import { McpPreviewHandler } from "../types";
import { InMemoryMcpRepository } from "../repository/in-memory";

export function createPreviewTool(repo: InMemoryMcpRepository): McpPreviewHandler {
  return {
    name: "kb.preview",
    async handle(input) {
      const record = repo.findChunk(input.chunkId);
      if (!record) {
        throw new Error(`Chunk ${input.chunkId} not found`);
      }
      return { chunk: record.chunk };
    }
  };
}
