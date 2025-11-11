import { ChunkRecord } from "../../../packages/core/src/retrieval";
import { Chunk } from "@kb/shared-schemas";

export class InMemoryMcpRepository {
  private readonly records: ChunkRecord[];

  constructor(records: ChunkRecord[]) {
    this.records = records;
  }

  findChunk(chunkId: string): ChunkRecord | undefined {
    return this.records.find((record) => record.chunk.chunkId === chunkId);
  }

  neighborsFor(chunkId: string, limit = 5): Chunk[] {
    const record = this.findChunk(chunkId);
    if (!record || !record.neighbors) return [];
    return record.neighbors.slice(0, limit);
  }

  allRecords() {
    return this.records;
  }
}
