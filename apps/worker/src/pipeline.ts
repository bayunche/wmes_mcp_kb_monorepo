import {
  AttachmentSchema,
  Chunk,
  ChunkSchema,
  Document,
  DocumentSchema,
  DocumentSection,
  Embedding,
  EmbeddingSchema,
  IngestionTask,
  IngestionTaskSchema,
  KnowledgeBundle,
  KnowledgeBundleSchema,
  Attachment,
  ModelSettingSecret,
  ModelRole,
  SemanticMetadata
} from "@kb/shared-schemas";
import { measureLatency } from "../../../packages/tooling/src/metrics";
import {
  BasicTextParser,
  ParsedElement,
  ChunkFragment,
  AdaptiveChunkFactory
} from "../../../packages/core/src/parsing";
import { SourcePayload, WorkerDependencies, DocumentParseResult } from "./types";
import { Buffer } from "node:buffer";
import { promises as fs } from "node:fs";
import type { VectorClient } from "../../../packages/core/src/vector";
import { generateTagsViaModel } from "../../../packages/core/src/tagging";
import { shouldUseOcr } from "../../../packages/core/src/ocr";
import type { VectorLogInput } from "@kb/data";
import { preprocessRawText } from "../../../packages/core/src/preprocess";
import type { SemanticSection } from "../../../packages/core/src/semantic-structure";

export async function processIngestionTask(
  task: IngestionTask,
  deps: WorkerDependencies
): Promise<KnowledgeBundle> {
  const start = Date.now();
  const source = await deps.fetchSource(task);
  try {
    const { document, elements } = await deps.parseDocument(task, source);
    const preprocessTarget = source.rawText ?? collectSegmenterText(elements, source);
    const preprocessResult = preprocessRawText(preprocessTarget);
    source.rawText = preprocessResult.text;
    source.preprocessResult = preprocessResult;
    const fragments = await deps.chunkDocument(document, elements, source);
    const semanticSections = source.semanticSections ?? [];
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
    const hydratedSections = mergeSectionsWithChunks(semanticSections, validatedChunks);

  const heuristicsTags = deriveDocumentTags(document, validatedChunks);
  const remoteTags = await generateRemoteTags(document, validatedChunks, deps);
  const autoTags = mergeTags(heuristicsTags, remoteTags, 12);
  const documentWithTags = DocumentSchema.parse({
    ...document,
    tags: mergeTags(document.tags, autoTags, 12)
  });

    const bundle = KnowledgeBundleSchema.parse({
      document: documentWithTags,
      chunks: validatedChunks,
      sections: hydratedSections,
      embeddings,
      attachments
    });

    const finalizedBundle: KnowledgeBundle = {
      ...bundle,
      document: {
        ...bundle.document,
        ingestStatus: "indexed",
        updatedAt: new Date().toISOString()
      }
    };

    await deps.knowledgeWriter.persistBundle(finalizedBundle);
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
    return finalizedBundle;
  } finally {
    await source.cleanup?.();
  }
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
  const chunkFactory = deps.chunkFactory ?? new AdaptiveChunkFactory();

  return {
    async fetchSource(task: IngestionTask): Promise<SourcePayload> {
      const tenantId = task.tenantId ?? deps.config.DEFAULT_TENANT_ID;
      const defaultLibrary = deps.config.DEFAULT_LIBRARY_ID ?? "default";
      const maxBytes = (deps.config.RAW_OBJECT_MAX_MEMORY_MB ?? 128) * 1024 * 1024;
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

      const libraryId = document?.libraryId ?? task.libraryId ?? defaultLibrary;

      let binary: Uint8Array | undefined;
      let filePath: string | undefined;
      let cleanup: (() => Promise<void>) | undefined;
      let mimeType = document?.mimeType;
      if (deps.storage && rawObjectKey) {
        try {
          const handle = await deps.storage.getRawObject(rawObjectKey, {
            maxInMemoryBytes: maxBytes
          });
          mimeType = mimeType ?? handle.mimeType;
          if (handle.type === "buffer") {
            binary = handle.data;
          } else {
            filePath = handle.path;
            cleanup = handle.cleanup;
          }
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
        filePath,
        mimeType: mimeType ?? (binary ? "application/octet-stream" : "text/plain"),
        filename: document?.sourceUri,
        document,
        tenantId,
        libraryId,
        rawObjectKey,
        cleanup
      };
    },
    async parseDocument(task: IngestionTask, source: SourcePayload): Promise<DocumentParseResult> {
      const tenantId = source.tenantId ?? task.tenantId ?? deps.config.DEFAULT_TENANT_ID;
      const libraryId = source.libraryId ?? task.libraryId ?? deps.config.DEFAULT_LIBRARY_ID ?? "default";
      const document =
        source.document ??
        DocumentSchema.parse({
          docId: task.docId,
          title: source.metadata?.title ?? `Doc ${task.docId}`,
          ingestStatus: "parsed",
          tenantId,
          libraryId,
          mimeType: source.mimeType,
          sourceUri: source.filename
        });

      let ocrElements: ParsedElement[] = [];
      if (
        deps.ocr &&
        deps.config.OCR_ENABLED &&
        shouldUseOcr(source.mimeType, source.filename)
      ) {
        const buffer = await ensureBinaryBuffer(source);
        if (buffer) {
          try {
            ocrElements = await deps.ocr.extract({
              buffer,
              filePath: source.filePath,
              filename: source.filename,
              mimeType: source.mimeType,
              language: deps.config.OCR_LANG
            });
            if (ocrElements.length) {
              source.ocrApplied = true;
              source.metadata = { ...source.metadata, ocrApplied: true };
              const combined = ocrElements
                .map((element) => element.text?.trim())
                .filter(Boolean)
                .join("\n\n");
              if (combined.length) {
                source.rawText = combined;
              }
            }
          } catch (error) {
            deps.logger.error?.(`OCR extraction failed: ${(error as Error).message}`);
          }
        }
      }

      let elements = await parser.parse({
        rawText: source.rawText,
        buffer: source.binary,
        mimeType: source.mimeType,
        filename: source.filename,
        metadata: { title: document.title }
      });
      if (!elements.length && ocrElements.length) {
        elements = ocrElements;
      }
      return { document, elements };
    },
    async chunkDocument(
      doc: Document,
      elements: ParsedElement[],
      source: SourcePayload
    ): Promise<ChunkFragment[]> {
      const fallback = () => {
        const fragments = chunkFactory.createChunks(doc, elements);
        source.semanticSections = [];
        return fragments;
      };
      try {
        const { fragments, sections } = await buildSemanticFragments(doc, elements, source, deps);
        source.semanticSections = sections;
        return fragments;
      } catch (error) {
        deps.logger.warn?.(
          `Semantic segmentation unavailable，fallback to chunk-based splitting: ${(error as Error).message}`
        );
        return fallback();
      }
    },
    async extractMetadata(doc: Document, chunks: Chunk[]): Promise<Chunk[]> {
      const enriched = chunks.map((chunk) => ({
        ...chunk,
        topicLabels: chunk.topicLabels ?? [doc.title]
      }));
      if (!enriched.length) {
        return enriched;
      }
      if (!deps.modelSettings) {
        deps.logger.warn?.("未注入 model_settings 仓库，跳过语义元数据生成");
        return enriched;
      }
      const setting = await loadModelSetting(doc, deps, "metadata");
      if (!setting) {
        deps.logger.warn?.("缺少 metadata 角色模型配置，跳过语义元数据生成");
        return enriched;
      }
      const configuredLimit = Number(process.env.SEMANTIC_METADATA_LIMIT ?? "0");
      const limit =
        configuredLimit > 0 ? Math.min(enriched.length, configuredLimit) : enriched.length;
      const results: Chunk[] = [];
      const useLocalMetadata = setting.provider === "local";
      if (!useLocalMetadata && !deps.semanticMetadata) {
        throw new Error("语义元数据模型未注入，无法调用远程 API");
      }
      let limitWarningLogged = false;
      for (const [index, chunk] of enriched.entries()) {
        if (!chunk.contentText?.trim()) {
          results.push(chunk);
          continue;
        }
        if (index >= limit) {
          if (!limitWarningLogged) {
            deps.logger.warn?.(
              `已达到 SEMANTIC_METADATA_LIMIT=${limit} 上限，后续 chunk 跳过语义元数据生成`
            );
            limitWarningLogged = true;
          }
          results.push(chunk);
          continue;
        }
        try {
          if (useLocalMetadata) {
            const metadata = generateLocalSemanticMetadata(doc, chunk);
            results.push(applySemanticMetadata(chunk, metadata));
            continue;
          }
          const metadata = await deps.semanticMetadata?.(
            {
              provider: setting.provider,
              baseUrl: setting.baseUrl,
              modelName: setting.modelName,
              apiKey: setting.apiKey
            },
            {
              title: doc.title,
              chunkText: chunk.contentText,
              hierPath: chunk.hierPath,
              tags: mergeTags(chunk.topicLabels, doc.tags ?? [], 12),
              language: doc.language,
              envLabels: chunk.envLabels,
              sectionTitle: chunk.sectionTitle ?? chunk.semanticTitle,
              parentPath: chunk.parentSectionPath ?? chunk.hierPath.slice(0, -1),
              parentSectionTitle:
                chunk.parentSectionPath?.length && chunk.parentSectionPath.length > 0
                  ? chunk.parentSectionPath[chunk.parentSectionPath.length - 1]
                  : undefined
            }
          );
          if (!metadata) {
            throw new Error("语义元数据生成返回空对象");
          }
          results.push(applySemanticMetadata(chunk, metadata));
        } catch (error) {
          deps.logger.error?.(
            `Semantic metadata generation failed for ${chunk.chunkId}: ${(error as Error).message}`
          );
          throw error;
        }
      }
      return results;
    },
    async embedChunks(
      doc: Document,
      chunks: Chunk[],
      _source: SourcePayload,
      context?: { fragments: ChunkFragment[] }
    ): Promise<Array<{ chunk: Chunk; embedding: Embedding }>> {
      const start = Date.now();
      let vectorError: Error | null = null;
      let resolved: Array<{ chunk: Chunk; embedding: Embedding }> = [];
      if (deps.vectorClient) {
        try {
          resolved = await embedWithVectorClient(chunks, context, deps.vectorClient, deps.logger);
        } catch (error) {
          vectorError = error as Error;
        }
      } else {
        vectorError = new Error("Vector client not configured");
      }
      const durationMs = Date.now() - start;
      const providerInfo = resolveVectorProvider(deps.config);
      const success = resolved.length > 0 && !vectorError;
      const metadata = vectorError ? { error: vectorError.message } : undefined;
      if (deps.vectorLogs) {
        try {
          if (success) {
            await deps.vectorLogs.append(
              buildVectorLogs(resolved, doc, durationMs, providerInfo, "success", metadata)
            );
          } else {
            await deps.vectorLogs.append(
              buildVectorFailureLogs(chunks, doc, durationMs, providerInfo, metadata)
            );
          }
        } catch (logError) {
          deps.logger.error?.(`Failed to append vector logs: ${(logError as Error).message}`);
        }
      }
      if (!success) {
        throw vectorError ?? new Error("向量化结果为空，已终止解析");
      }
      return resolved;
    }
  };
}

async function ensureBinaryBuffer(source: SourcePayload) {
  if (source.binary?.length) {
    return source.binary;
  }
  if (source.filePath) {
    try {
      const file = await fs.readFile(source.filePath);
      return new Uint8Array(file);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function applySemanticMetadata(chunk: Chunk, metadata: SemanticMetadata): Chunk {
  const mergedTopics = mergeTags(chunk.topicLabels ?? [], metadata.topics ?? [], 12);
  const mergedTags = mergeTags(chunk.semanticTags ?? [], metadata.semanticTags ?? [], 12);
  return {
    ...chunk,
    semanticMetadata: metadata,
    contextSummary: metadata.contextSummary ?? chunk.contextSummary,
    semanticTitle: metadata.title ?? chunk.semanticTitle ?? chunk.sectionTitle,
    semanticTags: mergedTags,
    topicLabels: mergedTopics,
    topics: metadata.topics ?? chunk.topics ?? mergedTopics,
    keywords: metadata.keywords ?? chunk.keywords,
    envLabels: metadata.envLabels ?? chunk.envLabels,
    bizEntities: metadata.bizEntities ?? chunk.bizEntities,
    nerEntities: metadata.entities ?? chunk.nerEntities,
    parentSectionPath: metadata.parentSectionPath ?? chunk.parentSectionPath
  };
}

function buildVectorLogs(
  entries: Array<{ chunk: Chunk; embedding: Embedding }>,
  doc: Document,
  durationMs: number,
  providerInfo: { provider: string; driver: "local" | "remote" },
  status: VectorLogInput["status"],
  metadata?: Record<string, unknown>
) {
  return entries.map<VectorLogInput>(({ chunk, embedding }) => ({
    chunkId: chunk.chunkId,
    docId: chunk.docId,
    tenantId: doc.tenantId ?? "default",
    libraryId: doc.libraryId ?? "default",
    modelRole: "embedding",
    provider: providerInfo.provider,
    modelName: embedding.modelName,
    driver: providerInfo.driver,
    status,
    durationMs,
    vectorDim: embedding.dim,
    inputChars: chunk.contentText?.length ?? 0,
    ocrUsed: chunk.entities ? (chunk.entities as Record<string, unknown>).ocr === true : undefined,
    metadata,
    errorMessage: metadata?.error as string | undefined
  }));
}

function buildVectorFailureLogs(
  chunks: Chunk[],
  doc: Document,
  durationMs: number,
  providerInfo: { provider: string; driver: "local" | "remote" },
  metadata?: Record<string, unknown>
) {
  return chunks.map<VectorLogInput>((chunk) => ({
    chunkId: chunk.chunkId,
    docId: chunk.docId,
    tenantId: doc.tenantId ?? "default",
    libraryId: doc.libraryId ?? "default",
    modelRole: "embedding",
    provider: providerInfo.provider,
    modelName: providerInfo.provider,
    driver: providerInfo.driver,
    status: "failed",
    durationMs,
    vectorDim: 0,
    inputChars: chunk.contentText?.length ?? 0,
    ocrUsed: chunk.entities ? (chunk.entities as Record<string, unknown>).ocr === true : undefined,
    metadata,
    errorMessage: metadata?.error as string | undefined
  }));
}

function resolveVectorProvider(config: WorkerDependencies["config"]) {
  if (config.TEXT_EMBEDDING_ENDPOINT) {
    try {
      const host = new URL(config.TEXT_EMBEDDING_ENDPOINT).host;
      return { provider: host, driver: "remote" as const };
    } catch {
      return { provider: "remote-endpoint", driver: "remote" as const };
    }
  }
  return {
    provider: config.LOCAL_TEXT_MODEL_ID ?? "local-model",
    driver: "local" as const
  };
}

function generateLocalSemanticMetadata(doc: Document, chunk: Chunk): SemanticMetadata {
  const content = chunk.contentText ?? doc.title ?? "";
  const normalized = content.replace(/\s+/g, " ").trim();
  const summary = normalized.slice(0, 240);
  const tokens = tokenizeContent(content).slice(0, 10);
  const semanticTags = mergeTags(chunk.semanticTags ?? [], tokens.slice(0, 5), 5);
  const topics = mergeTags(chunk.topics ?? [], tokens.slice(0, 3), 3);
  return {
    title: chunk.semanticTitle ?? chunk.sectionTitle ?? doc.title,
    contextSummary: summary,
    semanticTags,
    topics,
    keywords: tokens,
    envLabels: chunk.envLabels?.slice(0, 3),
    bizEntities: chunk.bizEntities ?? undefined,
    entities: chunk.nerEntities ?? undefined,
    parentSectionPath: chunk.parentSectionPath ?? chunk.hierPath,
    source: "heuristic"
  } as SemanticMetadata;
}

function buildRawObjectKey(tenantId: string, docId: string, mimeType?: string) {
  const extension = mimeType?.split("/")[1] ?? "bin";
  return `${tenantId}/${docId}/source.${extension}`;
}


async function buildSemanticFragments(
  doc: Document,
  elements: ParsedElement[],
  source: SourcePayload,
  deps: WorkerDependencies
): Promise<{ fragments: ChunkFragment[]; sections: DocumentSection[] }> {
  if (!deps.semanticSegmenter) {
    throw new Error("语义切分模型未配置，无法继续解析");
  }
  const text = collectSegmenterText(elements, source);
  if (!text.trim().length) {
    throw new Error("文档内容为空，无法进行语义切分");
  }
  const sections = await deps.semanticSegmenter({ document: doc, text });
  if (!sections.length) {
    throw new Error("语义切分返回空结果");
  }
  return normalizeSemanticSections(doc, sections);
}

function normalizeSemanticSections(
  doc: Document,
  sections: SemanticSection[]
): { fragments: ChunkFragment[]; sections: DocumentSection[] } {
  const blueprints: Array<{ section: DocumentSection; content: string }> = [];
  const keyMap = new Map<string, DocumentSection>();

  sections.forEach((section, index) => {
    const title = (section.title ?? "").trim() || `Section ${index + 1}`;
    const content = (section.content ?? "").trim();
    if (!content.length) {
      return;
    }
    const normalizedPath = Array.isArray(section.path)
      ? section.path.map((value) => value.trim()).filter(Boolean)
      : [];
    const documentSection: DocumentSection = {
      sectionId: crypto.randomUUID(),
      docId: doc.docId,
      parentSectionId: undefined,
      title,
      summary: section.content?.slice(0, 240) ?? undefined,
      level: section.level ?? Math.max(normalizedPath.length + 1, 1),
      path: normalizedPath,
      order: index,
      tags: [],
      keywords: [],
      createdAt: new Date().toISOString()
    };
    const key = [...normalizedPath, title].join(">");
    blueprints.push({ section: documentSection, content });
    keyMap.set(key, documentSection);
  });

  if (!blueprints.length) {
    throw new Error("语义切分未返回有效段落");
  }

  blueprints.forEach(({ section }) => {
    if (section.path.length) {
      const parentKey = section.path.join(">");
      const parent = keyMap.get(parentKey);
      if (parent) {
        section.parentSectionId = parent.sectionId;
      }
    }
  });

  const fragments = blueprints.map(({ section, content }) => {
    const hierPath = [doc.title, ...section.path, section.title];
    const chunk = ChunkSchema.parse({
      chunkId: crypto.randomUUID(),
      docId: doc.docId,
      hierPath,
      sectionTitle: section.title,
      semanticTitle: section.title,
      contentText: content,
      contentType: "text",
      parentSectionId: section.sectionId,
      parentSectionPath: hierPath.slice(0, -1),
      entities: section.level ? { semanticLevel: section.level } : undefined
    });
    return {
      chunk,
      source: {
        id: chunk.chunkId,
        type: "text",
        text: content,
        metadata: { semanticSectionId: section.sectionId, order: section.order }
      }
    };
  });

  return {
    fragments,
    sections: blueprints.map((item) => item.section)
  };
}

function collectSegmenterText(elements: ParsedElement[], source: SourcePayload) {
  if (source.rawText?.trim()) {
    return source.rawText;
  }
  const merged = elements
    .map((element) => element.text?.trim())
    .filter((value): value is string => Boolean(value))
    .join("\n\n");
  return merged;
}

function mergeSectionsWithChunks(
  sections: DocumentSection[],
  chunks: Chunk[]
): DocumentSection[] {
  if (!sections?.length) {
    return [];
  }
  const chunkIndex = new Map(
    chunks
      .filter((chunk) => chunk.parentSectionId)
      .map((chunk) => [chunk.parentSectionId as string, chunk])
  );
  return sections.map((section) => {
    const chunk = section.sectionId ? chunkIndex.get(section.sectionId) : undefined;
    return {
      ...section,
      summary: chunk?.contextSummary ?? section.summary,
      tags: chunk?.semanticTags ?? section.tags,
      keywords: chunk?.keywords ?? section.keywords
    };
  });
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
    chunkFactory: overrides.chunkFactory,
    modelSettings: overrides.modelSettings,
    vectorLogs: overrides.vectorLogs,
    ocr: overrides.ocr,
    semanticMetadata: overrides.semanticMetadata
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
    if (deps.documents) {
      try {
        await deps.documents.updateStatus(parsedTask.docId, "failed", (error as Error).message);
      } catch (updateError) {
        deps.logger.error?.(
          `Failed to update status for ${parsedTask.docId}: ${(updateError as Error).message}`
        );
      }
    }
    deps.logger.error?.(`Ingestion task failed for ${parsedTask.docId}: ${(error as Error).message}`);
    throw error;
  }
}

const STOP_WORDS = new Set([
  "the",
  "and",
  "with",
  "from",
  "that",
  "have",
  "this",
  "will",
  "shall",
  "合同",
  "文件",
  "数据"
]);

async function generateRemoteTags(
  document: Document,
  chunks: Chunk[],
  deps: WorkerDependencies
): Promise<string[]> {
  if (!deps.modelSettings) {
    return [];
  }
  const setting = await loadModelSetting(document, deps, "tagging");
  if (!setting) {
    return [];
  }
  const snippets = chunks
    .map((chunk) => chunk.contentText ?? "")
    .filter((text) => text.trim().length)
    .slice(0, 6);
  if (!snippets.length) {
    return [];
  }
  try {
    return await generateTagsViaModel(
      {
        provider: setting.provider,
        baseUrl: setting.baseUrl,
        modelName: setting.modelName,
        apiKey: setting.apiKey
      },
      {
        title: document.title,
        tags: document.tags,
        snippets,
        language: document.language,
        limit: 8
      }
    );
  } catch (error) {
    deps.logger.error?.(
      `Remote tag generation failed for ${document.docId}: ${(error as Error).message}`
    );
    return [];
  }
}

async function loadModelSetting(
  document: Document,
  deps: WorkerDependencies,
  role: ModelRole
): Promise<ModelSettingSecret | null> {
  if (!deps.modelSettings) {
    return null;
  }
  const tenantId = document.tenantId ?? deps.config.DEFAULT_TENANT_ID;
  const libraryId = document.libraryId ?? deps.config.DEFAULT_LIBRARY_ID;
  const direct = await deps.modelSettings.get(tenantId, libraryId, role);
  if (direct) {
    return direct;
  }
  if (libraryId !== deps.config.DEFAULT_LIBRARY_ID) {
    return deps.modelSettings.get(tenantId, deps.config.DEFAULT_LIBRARY_ID, role);
  }
  return null;
}

function deriveDocumentTags(document: Document, chunks: Chunk[], limit = 6): string[] {
  const tagScores = new Map<string, { label: string; score: number }>();

  const pushTag = (label: string, weight = 1) => {
    const cleaned = label.trim();
    if (!cleaned.length) return;
    const normalized = cleaned.toLowerCase();
    if (STOP_WORDS.has(normalized) || normalized.length < 2) {
      return;
    }
    const current = tagScores.get(normalized);
    if (current) {
      current.score += weight;
    } else {
      tagScores.set(normalized, { label: cleaned, score: weight });
    }
  };

  if (document.title) {
    pushTag(document.title, 2);
  }

  chunks.forEach((chunk) => {
    chunk.topicLabels?.forEach((label) => pushTag(label, 3));
    if (chunk.sectionTitle) {
      pushTag(chunk.sectionTitle, 2);
    }
    if (chunk.contentText) {
      tokenizeContent(chunk.contentText).forEach((token) => pushTag(token));
    }
  });

  const sorted = Array.from(tagScores.values()).sort((a, b) => b.score - a.score);
  return sorted.slice(0, limit).map((item) => item.label);
}

function tokenizeContent(text: string): string[] {
  const matches = text
    .toLowerCase()
    .match(/[\p{Letter}\p{Number}]{2,}/gu);
  if (!matches) return [];
  return matches
    .map((token) => token.slice(0, 24))
    .filter((token) => !STOP_WORDS.has(token));
}

function mergeTags(existing: string[] | undefined, generated: string[], limit = 8): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const append = (tag?: string) => {
    if (!tag) return;
    const normalized = tag.trim();
    if (!normalized.length) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(normalized);
  };

  existing?.forEach((tag) => append(tag));
  generated.forEach((tag) => append(tag));
  return result.slice(0, limit);
}
