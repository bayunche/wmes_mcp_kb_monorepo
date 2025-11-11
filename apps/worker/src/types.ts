import { AppConfig } from "@kb/core/src/config";
import {
  Attachment,
  Chunk,
  Document,
  Embedding,
  IngestionTask,
  KnowledgeBundle
} from "@kb/shared-schemas";
import { MetricsRegistry } from "../../packages/tooling/src/metrics";

export interface SourcePayload {
  rawText: string;
  metadata?: Record<string, unknown>;
  attachments?: Attachment[];
}

export interface WorkerLogger {
  info?: (message: string) => void;
  error?: (message: string | Error) => void;
}

export interface QueueClient {
  subscribe(handler: (task: IngestionTask) => Promise<void>): Promise<void> | void;
  enqueue(task: IngestionTask): Promise<void>;
}

export interface WorkerDependencies {
  config: AppConfig;
  fetchSource: (task: IngestionTask) => Promise<SourcePayload>;
  parseDocument: (task: IngestionTask, source: SourcePayload) => Promise<Document>;
  chunkDocument: (doc: Document, source: SourcePayload) => Promise<Chunk[]>;
  extractMetadata: (doc: Document, chunks: Chunk[], source: SourcePayload) => Promise<Chunk[]>;
  embedChunks: (
    doc: Document,
    chunks: Chunk[],
    source: SourcePayload
  ) => Promise<Array<{ chunk: Chunk; embedding?: Embedding }>>;
  persistBundle: (bundle: KnowledgeBundle, task: IngestionTask) => Promise<void>;
  queue: QueueClient;
  logger: WorkerLogger;
  metrics?: MetricsRegistry;
}
