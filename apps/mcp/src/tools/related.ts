import { McpRelatedHandler } from "../types";
import { InMemoryMcpRepository } from "../repository/in-memory";

export function createRelatedTool(repo: InMemoryMcpRepository): McpRelatedHandler {
  return {
    name: "kb.related",
    async handle(input) {
      const source = repo.findChunk(input.chunkId);
      if (!source) {
        throw new Error(`Chunk ${input.chunkId} not found`);
      }
      return {
        source: source.chunk,
        neighbors: repo.neighborsFor(input.chunkId, input.limit ?? 5)
      };
    }
  };
}
