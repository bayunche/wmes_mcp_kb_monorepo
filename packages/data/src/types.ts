import type {
  Document,
  KnowledgeBundle,
  IngestionTask,
  Attachment,
  ModelSettingSecret,
  ModelRole,
  VectorLog,
  DocumentSection,
  TenantConfig,
  LibraryConfig
} from "@kb/shared-schemas";
import type { ChunkRecord, ChunkRepository } from "@kb/core/src/retrieval";

export interface DocumentStats {
  documents: number;
  attachments: number;
  chunks: number;
  pendingJobs: number;
}

export interface DocumentRepository {
  upsert(document: Document): Promise<Document>;
  list(tenantId?: string, libraryId?: string): Promise<Document[]>;
  get(docId: string): Promise<Document | null>;
  updateTags(docId: string, tags: string[]): Promise<Document | null>;
  updateStatus(docId: string, status: Document["ingestStatus"], errorMessage?: string): Promise<void>;
  delete(docId: string): Promise<void>;
  count(tenantId?: string, libraryId?: string): Promise<number>;
  stats(tenantId?: string, libraryId?: string): Promise<DocumentStats>;
  listSections(docId: string): Promise<DocumentSection[]>;
}

export interface KnowledgeWriter {
  persistBundle(bundle: KnowledgeBundle): Promise<void>;
}

export interface ObjectStorage {
  getRawObject(objectKey: string, options?: RawObjectOptions): Promise<RawObjectHandle>;
  putRawObject(objectKey: string, payload: Buffer | Uint8Array | string, contentType?: string): Promise<string>;
  putPreviewObject(objectKey: string, payload: Buffer | Uint8Array, contentType?: string): Promise<string>;
  deleteRawObject(objectKey: string): Promise<void>;
  deletePreviewObject(objectKey: string): Promise<void>;
  deletePreviewPrefix?(prefix: string): Promise<void>;
}

export interface RawObjectOptions {
  maxInMemoryBytes?: number;
}

export type RawObjectHandle =
  | {
      type: "buffer";
      data: Uint8Array;
      size: number;
      mimeType?: string;
    }
  | {
      type: "file";
      path: string;
      size: number;
      mimeType?: string;
      cleanup?: () => Promise<void>;
    };

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

export interface TenantConfigRepository {
  list(): Promise<TenantConfig[]>;
  upsert(config: TenantConfig): Promise<TenantConfig>;
  delete(tenantId: string): Promise<void>;
}

export interface LibraryConfigRepository {
  list(tenantId?: string): Promise<LibraryConfig[]>;
  upsert(config: LibraryConfig): Promise<LibraryConfig>;
  delete(libraryId: string): Promise<void>;
}

export interface ModelSettingsRepository {
  get(tenantId: string, libraryId: string, modelRole?: ModelRole): Promise<ModelSettingSecret | null>;
  list(tenantId: string, libraryId: string): Promise<ModelSettingSecret[]>;
  upsert(setting: ModelSettingSecret): Promise<ModelSettingSecret>;
  delete(tenantId: string, libraryId: string, modelRole: ModelRole): Promise<void>;
}

export type VectorLogInput = Omit<VectorLog, "logId" | "createdAt"> & {
  logId?: string;
  createdAt?: string;
};

export interface VectorLogRepository {
  append(logs: VectorLogInput[]): Promise<void>;
  list(params: { docId?: string; chunkId?: string; tenantId?: string; libraryId?: string; limit?: number }): Promise<VectorLog[]>;
}

export interface DataLayer {
  documents: DocumentRepository;
  chunks: ChunkRepository;
  knowledgeWriter: KnowledgeWriter;
  queue: QueueAdapter;
  vectorIndex: VectorIndex;
  attachments: AttachmentRepository;
  modelSettings?: ModelSettingsRepository;
  vectorLogs?: VectorLogRepository;
  tenantConfigs?: TenantConfigRepository;
  libraryConfigs?: LibraryConfigRepository;
  storage?: ObjectStorage;
  close(): Promise<void>;
}
