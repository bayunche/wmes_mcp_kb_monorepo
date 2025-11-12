import type { Document, KnowledgeBundle, IngestionTask, Attachment } from "@kb/shared-schemas";
import type { ChunkRecord, ChunkRepository } from "@kb/core/src/retrieval";

export interface DocumentStats {
  documents: number;
  attachments: number;
  chunks: number;
  pendingJobs: number;
}

export interface DocumentRepository {
  upsert(document: Document): Promise<Document>;
  list(tenantId?: string): Promise<Document[]>;
  get(docId: string): Promise<Document | null>;
  updateTags(docId: string, tags: string[]): Promise<Document | null>;
  delete(docId: string): Promise<void>;
  count(tenantId?: string): Promise<number>;
  stats(tenantId?: string): Promise<DocumentStats>;
}

export interface KnowledgeWriter {
  persistBundle(bundle: KnowledgeBundle): Promise<void>;
}

export interface ObjectStorage {
  getRawObject(objectKey: string): Promise<Uint8Array>;
  putRawObject(objectKey: string, payload: Buffer | Uint8Array, contentType?: string): Promise<string>;
  putPreviewObject(objectKey: string, payload: Buffer | Uint8Array, contentType?: string): Promise<string>;
  deleteRawObject(objectKey: string): Promise<void>;
  deletePreviewObject(objectKey: string): Promise<void>;
  deletePreviewPrefix?(prefix: string): Promise<void>;
}

export interface QueueAdapter {
  enqueue(task: IngestionTask): Promise<void>;
  subscribe(handler: (task: IngestionTask) => Promise<void>): Promise<void>;
  close?(): Promise<void>;
}

export interface VectorIndex {
  upsert(chunks: Array<{ chunkId: string; vector: number[]; payload: Record<string, unknown> }>): Promise<void>;
  search(
    queryVector: number[],
    limit: number,
    filters?: Record<string, unknown>
  ): Promise<Array<{ chunkId: string; score: number }>>;
  deleteByChunkIds(chunkIds: string[]): Promise<void>;
}

export interface AttachmentRepository {
  listByChunkIds(chunkIds: string[]): Promise<Attachment[]>;
  listByDocument(docId: string): Promise<Attachment[]>;
  deleteByDocId(docId: string): Promise<void>;
  count(tenantId?: string): Promise<number>;
}

export interface DataLayer {
  documents: DocumentRepository;
  chunks: ChunkRepository;
  knowledgeWriter: KnowledgeWriter;
  queue: QueueAdapter;
  vectorIndex: VectorIndex;
  attachments: AttachmentRepository;
  storage?: ObjectStorage;
  close(): Promise<void>;
}
