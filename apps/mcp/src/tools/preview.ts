import { McpPreviewHandler } from "../types";
import { DbMcpRepository } from "../repository/db";

export function createPreviewTool(repo: DbMcpRepository): McpPreviewHandler {
  return {
    name: "kb.preview",
    async handle(input) {
      const record = await repo.findChunkWithAttachments(input.chunkId);
      if (!record) {
        throw new Error(`Chunk ${input.chunkId} not found`);
      }
      return record;
    }
  };
}
