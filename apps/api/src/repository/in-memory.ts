import { Document, DocumentSchema, Chunk, ChunkSchema } from "@kb/shared-schemas";
import { ChunkRecord } from "../../../packages/core/src/retrieval";

export class InMemoryApiRepository {
  private documents: Document[] = [];
  private chunks: ChunkRecord[] = [];

  constructor(initialDocs: Document[] = [], initialChunks: ChunkRecord[] = []) {
    this.documents = initialDocs;
    this.chunks = initialChunks;
  }

  saveDocument(doc: Document) {
    const parsed = DocumentSchema.parse(doc);
    this.documents.push(parsed);
    return parsed;
  }

  saveChunk(record: ChunkRecord) {
    const parsed: ChunkRecord = {
      chunk: ChunkSchema.parse(record.chunk),
      document: record.document,
      neighbors: record.neighbors,
      topicLabels: record.topicLabels,
      createdAt: record.createdAt
    };
    this.chunks.push(parsed);
    return parsed;
  }

  listDocuments() {
    return this.documents;
  }

  findChunk(chunkId: string) {
    return this.chunks.find((record) => record.chunk.chunkId === chunkId);
  }

  allChunks() {
    return this.chunks;
  }

  updateDocumentTags(docId: string, tags: string[]) {
    const doc = this.documents.find((d) => d.docId === docId);
    if (doc) {
      doc.tags = tags;
    }
    return doc;
  }
}
