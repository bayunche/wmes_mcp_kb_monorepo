import { AppConfig } from "@kb/core/src/config";
import {
  Attachment,
  Chunk,
  Document,
  DocumentSection,
  Embedding,
  IngestionTask
} from "@kb/shared-schemas";
import { MetricsRegistry } from "../../../packages/tooling/src/metrics";
import type {
  KnowledgeWriter,
  QueueAdapter,
  DocumentRepository,
  ObjectStorage,
  ModelSettingsRepository,
  VectorLogRepository,
  VectorLogInput
} from "@kb/data";
import type {
  ParsedElement,
  DocumentParser,
  ChunkFactory,
  ChunkFragment
} from "../../../packages/core/src/parsing";
import type { VectorClient } from "../../../packages/core/src/vector";
import type { OcrAdapter } from "../../../packages/core/src/ocr";
import type {
  SemanticMetadataModelConfig,
  SemanticMetadataInput
} from "../../../packages/core/src/semantic-metadata";
import type { SemanticMetadata } from "@kb/shared-schemas";
import type { SemanticSection } from "../../../packages/core/src/semantic-structure";
import type { PreprocessResult } from "../../../packages/core/src/preprocess";

export interface SourcePayload {
  rawText?: string;
  metadata?: Record<string, unknown>;
  attachments?: Attachment[];
  binary?: Uint8Array;
  filePath?: string;
  mimeType?: string;
  filename?: string;
  document?: Document;
  tenantId?: string;
  libraryId?: string;
  rawObjectKey?: string;
  cleanup?: () => Promise<void>;
  ocrApplied?: boolean;
  preprocessResult?: PreprocessResult;
  semanticSections?: DocumentSection[];
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
  ) => Promise<{ entries: Array<{ chunk: Chunk; embedding?: Embedding }>; logs?: VectorLogInput[] }>;
  knowledgeWriter: KnowledgeWriter;
  queue: QueueAdapter;
  logger: WorkerLogger;
  metrics?: MetricsRegistry;
  documents?: DocumentRepository;
  storage?: ObjectStorage;
  parser?: DocumentParser;
  chunkFactory?: ChunkFactory;
  vectorClient?: VectorClient;
  modelSettings?: ModelSettingsRepository;
  vectorLogs?: VectorLogRepository;
  ocr?: OcrAdapter;
  semanticMetadata?: SemanticMetadataGenerator;
  semanticSegmenter?: SemanticSegmenter;
}

export type SemanticMetadataGenerator = (
  config: SemanticMetadataModelConfig,
  input: SemanticMetadataInput
) => Promise<SemanticMetadata>;

export type VectorLogWriter = (logs: VectorLogInput[]) => Promise<void>;

export type SemanticSegmenter = (input: {
  document: Document;
  text: string;
}) => Promise<SemanticSection[]>;
