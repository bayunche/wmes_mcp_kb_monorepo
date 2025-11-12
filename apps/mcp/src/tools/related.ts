import { McpRelatedHandler } from "../types";
import { DbMcpRepository } from "../repository/db";

export function createRelatedTool(repo: DbMcpRepository): McpRelatedHandler {
  return {
    name: "kb.related",
    async handle(input) {
      const source = await repo.findChunkWithAttachments(input.chunkId);
      if (!source) {
        throw new Error(`Chunk ${input.chunkId} not found`);
      }
      const neighbors = await repo.neighborsFor(input.chunkId, input.limit ?? 5);
      return {
        source,
        neighbors
      };
    }
  };
}
