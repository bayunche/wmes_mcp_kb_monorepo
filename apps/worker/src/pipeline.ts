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
  KnowledgeBundleSchema,
  Attachment
} from "@kb/shared-schemas";
import { measureLatency } from "../../../packages/tooling/src/metrics";
import {
  BasicTextParser,
  SimpleChunkFactory,
  ParsedElement,
  ChunkFragment
} from "../../../packages/core/src/parsing";
import { SourcePayload, WorkerDependencies, DocumentParseResult } from "./types";
import { Buffer } from "node:buffer";
import type { VectorClient } from "../../../packages/core/src/vector";

const newlineSplitter = /\n{2,}|\r?\n/g;

export async function processIngestionTask(
  task: IngestionTask,
  deps: WorkerDependencies
): Promise<KnowledgeBundle> {
  const start = Date.now();
  const source = await deps.fetchSource(task);
  const { document, elements } = await deps.parseDocument(task, source);
  const fragments = await deps.chunkDocument(document, elements, source);
  const enrichedChunks = await deps.extractMetadata(
    document,
    fragments.map((fragment) => fragment.chunk),
    source
  );
  const attachments = await prepareAttachments(document, fragments, source, deps);
  const embedded = await deps.embedChunks(document, enrichedChunks, source, { fragments });
  const validatedChunks = embedded.map((item) => ChunkSchema.parse(item.chunk));
  const embeddings = embedded
    .map((item) => item.embedding)
    .filter((item): item is Embedding => Boolean(item))
    .map((embedding) => EmbeddingSchema.parse(embedding));

  const bundle = KnowledgeBundleSchema.parse({
    document,
    chunks: validatedChunks,
    embeddings,
    attachments
  });

  await deps.knowledgeWriter.persistBundle(bundle);
  deps.logger.info?.(`Ingestion pipeline completed for ${task.docId}`);
  if (deps.metrics) {
    deps.metrics.counter("kb_ingestion_total", "Total ingestion tasks processed").inc();
    measureLatency(
      deps.metrics,
      "kb_ingestion_pipeline_seconds",
      "Ingestion pipeline duration",
      start,
      [0.5, 1, 2, 5]
    );
  }
  return bundle;
}

interface WorkerStageOverrides {
  fetchSource?: WorkerDependencies["fetchSource"];
  parseDocument?: WorkerDependencies["parseDocument"];
  chunkDocument?: WorkerDependencies["chunkDocument"];
  extractMetadata?: WorkerDependencies["extractMetadata"];
  embedChunks?: WorkerDependencies["embedChunks"];
}

function createDefaultWorkerStages(deps: WorkerDependencies): Required<WorkerStageOverrides> {
  const parser = deps.parser ?? new BasicTextParser();
  const chunkFactory = deps.chunkFactory ?? new SimpleChunkFactory();

  return {
    async fetchSource(task: IngestionTask): Promise<SourcePayload> {
      const tenantId = task.tenantId ?? deps.config.DEFAULT_TENANT_ID;
      let document: Document | undefined;
      if (deps.documents) {
        try {
          document = await deps.documents.get(task.docId) ?? undefined;
        } catch (error) {
          deps.logger.error?.(error as Error);
        }
      }

      const rawObjectKey =
        document?.sourceUri ?? buildRawObjectKey(tenantId, task.docId, document?.mimeType);

      let binary: Uint8Array | undefined;
      if (deps.storage && rawObjectKey) {
        try {
          binary = await deps.storage.getRawObject(rawObjectKey);
        } catch (error) {
          deps.logger.info?.(
            `Raw object missing for ${task.docId}: ${(error as Error).message}`
          );
        }
      }

      const metadata: Record<string, unknown> = {
        document,
        title: document?.title,
        rawObjectKey
      };

      return {
        rawText: document?.title ? `${document.title}\n${document.sourceUri ?? ""}` : undefined,
        metadata,
        attachments: [],
        binary,
        mimeType: document?.mimeType ?? (binary ? "application/octet-stream" : "text/plain"),
        filename: document?.sourceUri,
        document,
        tenantId,
        rawObjectKey
      };
    },
    async parseDocument(task: IngestionTask, source: SourcePayload): Promise<DocumentParseResult> {
      const tenantId = source.tenantId ?? task.tenantId ?? deps.config.DEFAULT_TENANT_ID;
      const document =
        source.document ??
        DocumentSchema.parse({
          docId: task.docId,
          title: source.metadata?.title ?? `Doc ${task.docId}`,
          ingestStatus: "parsed",
          tenantId,
          mimeType: source.mimeType,
          sourceUri: source.filename
        });

      const elements = await parser.parse({
        rawText: source.rawText,
        buffer: source.binary,
        mimeType: source.mimeType,
        filename: source.filename,
        metadata: { title: document.title }
      });

      return { document, elements };
    },
    async chunkDocument(
      doc: Document,
      elements: ParsedElement[],
      source: SourcePayload
    ): Promise<ChunkFragment[]> {
      if (elements.length) {
        return chunkFactory.createChunks(doc, elements);
      }
      const rawText = source.rawText ?? "";
      if (!rawText.trim()) {
        return [];
      }
      const paragraphs = rawText
        .split(newlineSplitter)
        .map((section) => section.trim())
        .filter(Boolean);

      return paragraphs.map((paragraph, index) => {
        const chunk = ChunkSchema.parse({
          chunkId: crypto.randomUUID(),
          docId: doc.docId,
          hierPath: [doc.title, `段落 ${index + 1}`],
          contentText: paragraph,
          contentType: "text"
        });
        return {
          chunk,
          source: {
            id: chunk.chunkId,
            type: "text",
            text: paragraph,
            metadata: { paragraphIndex: index }
          }
        };
      });
    },
    async extractMetadata(doc: Document, chunks: Chunk[]): Promise<Chunk[]> {
      return chunks.map((chunk) => ({
        ...chunk,
        topicLabels: chunk.topicLabels ?? [doc.title]
      }));
    },
    async embedChunks(
      doc: Document,
      chunks: Chunk[],
      _source: SourcePayload,
      context?: { fragments: ChunkFragment[] }
    ): Promise<Array<{ chunk: Chunk; embedding: Embedding }>> {
      if (deps.vectorClient) {
        const embeddings = await embedWithVectorClient(chunks, context, deps.vectorClient, deps.logger);
        if (embeddings.length) {
          return embeddings;
        }
      }
      return chunks.map((chunk) => {
        const vector = Array.from(
          { length: deps.config.VECTOR_FALLBACK_DIM ?? 4 },
          (_, idx) => (chunk.contentText?.length ?? 0) + idx
        );
        return {
          chunk,
          embedding: EmbeddingSchema.parse({
            embId: crypto.randomUUID(),
            chunkId: chunk.chunkId,
            modality: chunk.contentType === "image" ? "image" : "text",
            modelName: "demo",
            vector,
            dim: vector.length
          })
        };
      });
    }
  };
}

function buildRawObjectKey(tenantId: string, docId: string, mimeType?: string) {
  const extension = mimeType?.split("/")[1] ?? "bin";
  return `${tenantId}/${docId}/source.${extension}`;
}

function buildPreviewObjectKey(
  tenantId: string,
  docId: string,
  category: "tables" | "images" | "attachments",
  chunkId: string,
  extension: string
) {
  return `${tenantId}/${docId}/${category}/${chunkId}.${extension}`;
}

async function prepareAttachments(
  doc: Document,
  fragments: ChunkFragment[],
  source: SourcePayload,
  deps: WorkerDependencies
): Promise<Attachment[]> {
  const initial = source.attachments?.map((attachment) => AttachmentSchema.parse(attachment)) ?? [];
  if (!deps.storage) {
    return initial;
  }
  const tenantId = source.tenantId ?? doc.tenantId ?? deps.config.DEFAULT_TENANT_ID;
  const uploads: Attachment[] = [];

  for (const fragment of fragments) {
    const element = fragment.source;
    if (element.type === "image" && element.data?.length) {
      const objectKey = buildPreviewObjectKey(tenantId, doc.docId, "images", fragment.chunk.chunkId, "png");
      try {
        await deps.storage.putPreviewObject(objectKey, element.data, element.mimeType ?? "image/png");
        uploads.push(
          AttachmentSchema.parse({
            assetId: crypto.randomUUID(),
            docId: doc.docId,
            chunkId: fragment.chunk.chunkId,
            assetType: "image",
            objectKey,
            mimeType: element.mimeType ?? "image/png",
            pageNo: fragment.chunk.pageNo,
            bbox: fragment.chunk.bbox
          })
        );
      } catch (error) {
        deps.logger.error?.(`Failed to upload image attachment: ${(error as Error).message}`);
      }
    }

    if (element.type === "table" && element.structuredData) {
      const objectKey = buildPreviewObjectKey(tenantId, doc.docId, "tables", fragment.chunk.chunkId, "json");
      try {
        const payload = Buffer.from(JSON.stringify(element.structuredData), "utf8");
        await deps.storage.putPreviewObject(objectKey, payload, "application/json");
        uploads.push(
          AttachmentSchema.parse({
            assetId: crypto.randomUUID(),
            docId: doc.docId,
            chunkId: fragment.chunk.chunkId,
            assetType: "table",
            objectKey,
            mimeType: "application/json",
            pageNo: fragment.chunk.pageNo,
            bbox: fragment.chunk.bbox
          })
        );
      } catch (error) {
        deps.logger.error?.(`Failed to upload table attachment: ${(error as Error).message}`);
      }
    }
  }

  return [...initial, ...uploads];
}

async function embedWithVectorClient(
  chunks: Chunk[],
  context: { fragments: ChunkFragment[] } | undefined,
  client: VectorClient,
  logger: WorkerDependencies["logger"]
) {
  try {
    const associations = new Map<string, ChunkFragment>();
    context?.fragments?.forEach((fragment) => associations.set(fragment.chunk.chunkId, fragment));

    const textEntries = chunks
      .map((chunk, index) => ({ chunk, index }))
      .filter((item) => item.chunk.contentType !== "image");
    const textInputs = textEntries.map(
      ({ chunk }) =>
        chunk.contentText ??
        chunk.sectionTitle ??
        chunk.hierPath.join(" > ") ??
        `Document ${chunk.docId}`
    );
    const textVectors = textInputs.length ? await client.embedText(textInputs) : [];

    const imageFragments =
      context?.fragments?.filter(
        (fragment) => fragment.chunk.contentType === "image" && fragment.source.data?.length
      ) ?? [];

    const embeddings = new Map<string, Embedding>();

    textEntries.forEach(({ chunk }, idx) => {
      const vector = textVectors[idx];
      if (vector?.vector?.length) {
        embeddings.set(
          chunk.chunkId,
          EmbeddingSchema.parse({
            embId: crypto.randomUUID(),
            chunkId: chunk.chunkId,
            modality: "text",
            modelName: vector.model,
            vector: vector.vector,
            dim: vector.vector.length
          })
        );
      }
    });

    for (const fragment of imageFragments) {
      if (!fragment.source.data) continue;
      const result = await client.embedImage(fragment.source.data);
      embeddings.set(
        fragment.chunk.chunkId,
        EmbeddingSchema.parse({
          embId: crypto.randomUUID(),
          chunkId: fragment.chunk.chunkId,
          modality: "image",
          modelName: result.model,
          vector: result.vector,
          dim: result.vector.length
        })
      );
    }

    if (embeddings.size === chunks.length) {
      return chunks.map((chunk) => ({
        chunk,
        embedding: embeddings.get(chunk.chunkId)!
      }));
    }

    return [];
  } catch (error) {
    logger.error?.(`Vector embedding failed: ${(error as Error).message}`);
    return [];
  }
}

export function resolveDependencies(
  overrides: Partial<WorkerDependencies>
): WorkerDependencies {
  if (!overrides.config) {
    throw new Error("Worker config is required");
  }
  if (!overrides.queue) {
    throw new Error("Queue adapter is required");
  }
  if (!overrides.knowledgeWriter) {
    throw new Error("Knowledge writer is required");
  }

  const base: WorkerDependencies = {
    fetchSource: overrides.fetchSource as WorkerDependencies["fetchSource"],
    parseDocument: overrides.parseDocument as WorkerDependencies["parseDocument"],
    chunkDocument: overrides.chunkDocument as WorkerDependencies["chunkDocument"],
    extractMetadata: overrides.extractMetadata as WorkerDependencies["extractMetadata"],
    embedChunks: overrides.embedChunks as WorkerDependencies["embedChunks"],
    config: overrides.config,
    queue: overrides.queue,
    knowledgeWriter: overrides.knowledgeWriter,
    logger: overrides.logger ?? console,
    metrics: overrides.metrics,
    documents: overrides.documents,
    storage: overrides.storage,
    parser: overrides.parser,
    chunkFactory: overrides.chunkFactory
  };

  const defaults = createDefaultWorkerStages(base);

  return {
    ...base,
    fetchSource: overrides.fetchSource ?? defaults.fetchSource,
    parseDocument: overrides.parseDocument ?? defaults.parseDocument,
    chunkDocument: overrides.chunkDocument ?? defaults.chunkDocument,
    extractMetadata: overrides.extractMetadata ?? defaults.extractMetadata,
    embedChunks: overrides.embedChunks ?? defaults.embedChunks
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
