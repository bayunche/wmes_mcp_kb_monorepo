import type { AttachmentRepository } from "@kb/data";
import type { ChunkRepository, ChunkRecord } from "../../../../packages/core/src/retrieval";
import type { Attachment } from "@kb/shared-schemas";

export interface ChunkContext {
  chunk: ChunkRecord["chunk"];
  attachments: Attachment[];
  sourceUri: string;
}

export class DbMcpRepository {
  constructor(
    private readonly repo: ChunkRepository,
    private readonly attachments: AttachmentRepository
  ) {}

  async findChunk(chunkId: string): Promise<ChunkRecord | null> {
    return this.repo.get(chunkId);
  }

  async findChunkWithAttachments(chunkId: string): Promise<ChunkContext | null> {
    const record = await this.repo.get(chunkId);
    if (!record) return null;
    const attachments = await this.attachments.listByChunkIds([chunkId]);
    return {
      chunk: record.chunk,
      attachments,
      sourceUri: `kb://chunk/${chunkId}`
    };
  }

  async neighborsFor(chunkId: string, limit = 5): Promise<ChunkContext[]> {
    const record = await this.repo.get(chunkId);
    if (!record || !this.repo.listByDocument) {
      return [];
    }
    const siblings = await this.repo.listByDocument(record.chunk.docId);
    const neighbors = siblings
      .filter((candidate) => candidate.chunk.chunkId !== chunkId)
      .slice(0, limit);
    const attachments = await this.attachments.listByChunkIds(
      neighbors.map((item) => item.chunk.chunkId)
    );
    const attachmentMap = groupAttachments(attachments);
    return neighbors.map((neighbor) => ({
      chunk: neighbor.chunk,
      attachments: attachmentMap.get(neighbor.chunk.chunkId) ?? [],
      sourceUri: `kb://chunk/${neighbor.chunk.chunkId}`
    }));
  }

  async attachmentsForChunks(chunkIds: string[]): Promise<Map<string, Attachment[]>> {
    if (!chunkIds.length) return new Map();
    const attachments = await this.attachments.listByChunkIds(chunkIds);
    return groupAttachments(attachments);
  }
}

function groupAttachments(attachments: Attachment[]) {
  const map = new Map<string, Attachment[]>();
  for (const attachment of attachments) {
    if (!attachment.chunkId) continue;
    const current = map.get(attachment.chunkId) ?? [];
    current.push(attachment);
    map.set(attachment.chunkId, current);
  }
  return map;
}
