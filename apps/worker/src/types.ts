import { AppConfig } from "@kb/core/src/config";
import { Attachment, Chunk, Document, Embedding, IngestionTask } from "@kb/shared-schemas";
import { MetricsRegistry } from "../../packages/tooling/src/metrics";
import type { KnowledgeWriter, QueueAdapter, DocumentRepository, ObjectStorage } from "@kb/data";
import type { ParsedElement, DocumentParser, ChunkFactory, ChunkFragment } from "../../../packages/core/src/parsing";
import type { VectorClient } from "../../../packages/core/src/vector";

export interface SourcePayload {
  rawText?: string;
  metadata?: Record<string, unknown>;
  attachments?: Attachment[];
  binary?: Uint8Array;
  mimeType?: string;
  filename?: string;
  document?: Document;
  tenantId?: string;
  rawObjectKey?: string;
}

export interface WorkerLogger {
  info?: (message: string) => void;
  error?: (message: string | Error) => void;
}

export interface DocumentParseResult {
  document: Document;
  elements: ParsedElement[];
}

export interface WorkerDependencies {
  config: AppConfig;
  fetchSource: (task: IngestionTask) => Promise<SourcePayload>;
  parseDocument: (task: IngestionTask, source: SourcePayload) => Promise<DocumentParseResult>;
  chunkDocument: (
    doc: Document,
    elements: ParsedElement[],
    source: SourcePayload
  ) => Promise<ChunkFragment[]>;
  extractMetadata: (doc: Document, chunks: Chunk[], source: SourcePayload) => Promise<Chunk[]>;
  embedChunks: (
    doc: Document,
    chunks: Chunk[],
    source: SourcePayload,
    context?: { fragments: ChunkFragment[] }
  ) => Promise<Array<{ chunk: Chunk; embedding?: Embedding }>>;
  knowledgeWriter: KnowledgeWriter;
  queue: QueueAdapter;
  logger: WorkerLogger;
  metrics?: MetricsRegistry;
  documents?: DocumentRepository;
  storage?: ObjectStorage;
  parser?: DocumentParser;
  chunkFactory?: ChunkFactory;
  vectorClient?: VectorClient;
}
