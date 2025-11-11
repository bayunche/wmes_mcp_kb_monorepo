import {
  AttachmentSchema,
  Chunk,
  ChunkSchema,
  Document,
  DocumentSchema,
  Embedding,
  EmbeddingSchema,
  IngestionTask,
  IngestionTaskSchema,
  KnowledgeBundle,
  KnowledgeBundleSchema
} from "@kb/shared-schemas";
import { measureLatency } from "../../../packages/tooling/src/metrics";
import { SourcePayload, WorkerDependencies } from "./types";

const newlineSplitter = /\n{2,}|\r?\n/g;

export async function processIngestionTask(
  task: IngestionTask,
  deps: WorkerDependencies
): Promise<KnowledgeBundle> {
  const start = Date.now();
  const source = await deps.fetchSource(task);
  const document = await deps.parseDocument(task, source);
  const chunks = await deps.chunkDocument(document, source);
  const enrichedChunks = await deps.extractMetadata(document, chunks, source);
  const embedded = await deps.embedChunks(document, enrichedChunks, source);
  const validatedChunks = embedded.map((item) => ChunkSchema.parse(item.chunk));
  const embeddings = embedded
    .map((item) => item.embedding)
    .filter((item): item is Embedding => Boolean(item))
    .map((embedding) => EmbeddingSchema.parse(embedding));
  const attachments =
    source.attachments?.map((attachment) => AttachmentSchema.parse(attachment)) ?? [];

  const bundle = KnowledgeBundleSchema.parse({
    document,
    chunks: validatedChunks,
    embeddings,
    attachments
  });

  await deps.persistBundle(bundle, task);
  deps.logger.info?.(`Ingestion pipeline completed for ${task.docId}`);
  if (deps.metrics) {
    deps.metrics.counter("kb_ingestion_total", "Total ingestion tasks processed").inc();
    measureLatency(deps.metrics, "kb_ingestion_pipeline_seconds", "Ingestion pipeline duration", start, [
      0.5,
      1,
      2,
      5
    ]);
  }
  return bundle;
}

export const defaultWorkerStages = {
  async fetchSource(task: IngestionTask): Promise<SourcePayload> {
    return {
      rawText: `Document ${task.docId}\n\nThis is a placeholder source for tenant ${task.tenantId}.`,
      metadata: { source: "demo" }
    };
  },
  async parseDocument(task: IngestionTask, source: SourcePayload): Promise<Document> {
    return DocumentSchema.parse({
      docId: task.docId,
      title: (source.metadata?.title as string) ?? `Doc ${task.docId}`,
      ingestStatus: "parsed",
      tenantId: task.tenantId
    });
  },
  async chunkDocument(doc: Document, source: SourcePayload): Promise<Chunk[]> {
    const paragraphs = source.rawText
      .split(newlineSplitter)
      .map((section) => section.trim())
      .filter(Boolean);

    if (paragraphs.length === 0) {
      paragraphs.push(source.rawText);
    }

    return paragraphs.map((paragraph, index) =>
      ChunkSchema.parse({
        chunkId: crypto.randomUUID(),
        docId: doc.docId,
        hierPath: [doc.title, `段落 ${index + 1}`],
        contentText: paragraph,
        contentType: "text"
      })
    );
  },
  async extractMetadata(doc: Document, chunks: Chunk[]): Promise<Chunk[]> {
    return chunks.map((chunk) => ({
      ...chunk,
      topicLabels: chunk.topicLabels ?? [doc.title]
    }));
  },
  async embedChunks(
    doc: Document,
    chunks: Chunk[]
  ): Promise<Array<{ chunk: Chunk; embedding: Embedding }>> {
    return chunks.map((chunk) => {
      const vector = Array.from({ length: 4 }, (_, idx) => (chunk.contentText?.length ?? 0) + idx);
      return {
        chunk,
        embedding: EmbeddingSchema.parse({
          embId: crypto.randomUUID(),
          chunkId: chunk.chunkId,
          modality: "text",
          modelName: "demo",
          vector,
          dim: vector.length
        })
      };
    });
  },
  async persistBundle(bundle: KnowledgeBundle) {
    if (process.env.VERBOSE_WORKER === "true") {
      console.log("Persist bundle placeholder:", {
        docId: bundle.document.docId,
        chunks: bundle.chunks.length,
        embeddings: bundle.embeddings?.length ?? 0
      });
    }
  }
};

export function resolveDependencies(
  overrides: Partial<WorkerDependencies>
): WorkerDependencies {
  if (!overrides.config) {
    throw new Error("Worker config is required");
  }
  if (!overrides.queue) {
    throw new Error("Queue client is required");
  }

  return {
    fetchSource: defaultWorkerStages.fetchSource,
    parseDocument: defaultWorkerStages.parseDocument,
    chunkDocument: defaultWorkerStages.chunkDocument,
    extractMetadata: defaultWorkerStages.extractMetadata,
    embedChunks: defaultWorkerStages.embedChunks,
    persistBundle: defaultWorkerStages.persistBundle,
    logger: console,
    ...overrides
  } as WorkerDependencies;
}

export async function handleQueueMessage(task: unknown, deps: WorkerDependencies) {
  const parsedTask = IngestionTaskSchema.parse(task);
  try {
    await processIngestionTask(parsedTask, deps);
  } catch (error) {
    deps.metrics?.counter("kb_ingestion_errors_total", "Ingestion task errors").inc();
    throw error;
  }
}
