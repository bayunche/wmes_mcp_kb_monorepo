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
import { generateSemanticMetadataViaModel } from "../../../packages/core/src/semantic-metadata";
import { SourcePayload, WorkerDependencies, DocumentParseResult } from "./types";
import { Buffer } from "node:buffer";
import { promises as fs } from "node:fs";
import type { VectorClient } from "../../../packages/core/src/vector";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
interface PreSegment {
  text: string;
  heading?: { title: string; level: HeadingLevel };
  page?: number;
}

interface PathNode {
  key: string;
  sectionId: string;
}

interface CoarseBlock {
  title?: string;
  path: string[];
  text: string;
}
import { generateTagsViaModel } from "../../../packages/core/src/tagging";
import { shouldUseOcr } from "../../../packages/core/src/ocr";
import type { VectorLogInput } from "@kb/data";
import { preprocessRawText } from "../../../packages/core/src/preprocess";
import type { SemanticSection } from "../../../packages/core/src/semantic-structure";

function sanitizeString(input: string | undefined | null): string {
  if (!input) return "";
  // 1) 去除控制字符；2) 去除孤立代理项（Postgres UTF8 不接受）；3) 重新编码确保字节序列有效
  const withoutControl = input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ");
  const withoutSurrogate = withoutControl.replace(/[\uD800-\uDFFF]/g, "");
  return Buffer.from(withoutSurrogate, "utf8").toString("utf8");
}

export async function processIngestionTask(
  task: IngestionTask,
  deps: WorkerDependencies
): Promise<KnowledgeBundle> {
  const start = Date.now();
  const source = await deps.fetchSource(task);
  const stage = createStageTracker(task, deps);
  try {
    await stage.mark("parsing", "start");
    const { document, elements } = await deps.parseDocument(task, source);
    await stage.mark("parsing", "success", { elements: elements.length, mime: source.mimeType });

    await stage.mark("preprocess", "start");
    const preprocessTarget = source.rawText ?? collectSegmenterText(elements, source);
    const preprocessResult = preprocessRawText(preprocessTarget);
    const cleanedText = sanitizeString(preprocessResult.text);
    source.rawText = cleanedText;
    source.preprocessResult = { ...preprocessResult, text: cleanedText };
    await stage.mark("preprocess", "success", { length: preprocessResult.text.length });

    await stage.mark("chunking", "start");
    const fragments = await deps.chunkDocument(document, elements, source);
    await stage.mark("chunking", "success", { fragments: fragments.length });
    const semanticSections = source.semanticSections ?? [];
    await stage.mark("tagging_meta", "start");
    const enrichedChunks = await deps.extractMetadata(
      document,
      fragments.map((fragment) => fragment.chunk),
      source
    );
    await stage.mark("tagging_meta", "success", { chunks: enrichedChunks.length });
    const attachments = await prepareAttachments(document, fragments, source, deps);
    await stage.mark("embedding", "start");
    const embeddedResult = await deps.embedChunks(document, enrichedChunks, source, { fragments });
    const validatedChunks = embeddedResult.entries.map((item) => ChunkSchema.parse(item.chunk));
    const embeddings = embeddedResult.entries
      .map((item) => item.embedding)
      .filter((item): item is Embedding => Boolean(item))
      .map((embedding) => EmbeddingSchema.parse(embedding));
    await stage.mark("embedding", "success", {
      embeddings: embeddings.length,
      logs: embeddedResult.logs?.length ?? 0
    });
    const hydratedSections = mergeSectionsWithChunks(semanticSections, validatedChunks);

  const heuristicsTags = deriveDocumentTags(document, validatedChunks);
  const remoteTags = await generateRemoteTags(document, validatedChunks, deps);
  const autoTags = mergeTags(heuristicsTags, remoteTags, 12);
  const documentWithTags = sanitizeDocument(
    DocumentSchema.parse({
      ...document,
      tags: mergeTags(document.tags, autoTags, 12)
    })
  );

    const bundle = KnowledgeBundleSchema.parse({
      document: documentWithTags,
      chunks: validatedChunks.map(sanitizeChunk),
      sections: hydratedSections.map(sanitizeSection),
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

    await stage.mark("persisting", "start", {
      chunks: validatedChunks.length,
      embeddings: embeddings.length,
      attachments: attachments.length
    });
    await deps.knowledgeWriter.persistBundle(finalizedBundle);
    if (deps.vectorLogs && embeddedResult.logs?.length && validatedChunks.length) {
      try {
        const validIds = new Set(validatedChunks.map((c) => c.chunkId));
        const filteredLogs =
          embeddedResult.logs?.filter((log) => !log.chunkId || validIds.has(log.chunkId)) ?? [];
        if (filteredLogs.length !== embeddedResult.logs.length) {
          deps.logger.warn?.(
            `Dropped ${embeddedResult.logs.length - filteredLogs.length} vector logs due to missing chunk reference`
          );
        }
        if (filteredLogs.length) {
          await deps.vectorLogs.append(filteredLogs);
        }
      } catch (logError) {
        deps.logger.error?.(`Failed to append vector logs: ${(logError as Error).message}`);
      }
    }
    await stage.mark("completed", "success");
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
  } catch (error) {
    const message = (error as Error).message;
    await stage.mark("failed", "error", { error: message });
    throw error;
  } finally {
    await source.cleanup?.();
  }
}

type StageName =
  | "parsing"
  | "preprocess"
  | "chunking"
  | "tagging_meta"
  | "embedding"
  | "persisting"
  | "completed"
  | "failed";

type StageStatus = "start" | "success" | "error";

function createStageTracker(task: IngestionTask, deps: WorkerDependencies) {
  const tenantId = task.tenantId ?? deps.config.DEFAULT_TENANT_ID ?? "default";
  const libraryId = task.libraryId ?? deps.config.DEFAULT_LIBRARY_ID ?? "default";
  const timeline: Array<{ stage: StageName; status: StageStatus; at: string; meta?: Record<string, unknown> }> = [];

  const write = async (stage: StageName, status: StageStatus, meta?: Record<string, unknown>) => {
    const entry = {
      stage,
      status,
      at: new Date().toISOString(),
      meta
    };
    timeline.push(entry);
    const payload = { stages: timeline, tenantId, libraryId };
    deps.logger.info?.(
      `[stage=${stage} status=${status} doc=${task.docId} tenant=${tenantId} library=${libraryId}] ${JSON.stringify(meta ?? {})}`
    );
    if (deps.documents?.updateStatusMeta) {
      try {
        await deps.documents.updateStatusMeta(task.docId, {
          statusMeta: payload,
          ingestStatus: stage === "completed" ? "indexed" : stage === "failed" ? "failed" : undefined,
          errorMessage: status === "error" ? (meta?.error as string | undefined) : undefined
        });
      } catch (error) {
        deps.logger.error?.(`Failed to update status_meta for ${task.docId}: ${(error as Error).message}`);
      }
    }
  };

  return {
    mark: (stage: StageName, status: StageStatus, meta?: Record<string, unknown>) => write(stage, status, meta)
  };
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
        // 不预填 rawText，避免解析阶段被占用导致 OCR 失效
        rawText: undefined,
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
      let elements = await parser.parse({
        rawText: source.rawText,
        buffer: source.binary,
        mimeType: source.mimeType,
        filename: source.filename,
        metadata: { title: document.title }
      });
      deps.logger.info?.(
        `Parse result | doc=${document.docId} mime=${source.mimeType ?? "unknown"} file=${source.filename ?? "unknown"} count=${elements.length}`
      );
      // 对 PDF 进一步检查：若只有极少内容，触发 OCR 兜底
      if (
        elements.length <= 1 &&
        (source.mimeType?.toLowerCase().includes("pdf") ?? false) &&
        (!elements[0]?.text || elements[0].text.length < 200)
      ) {
        deps.logger.info?.(
          `Parse content too small, fallback OCR | doc=${document.docId} file=${source.filename ?? "unknown"}`
        );
        elements = [];
      }
      if (!elements.length) {
        // parser 结果为空时才尝试 OCR；仅 PDF 触发，逐页渲染为图片后调用 OCR
        if (
          deps.ocr &&
          deps.config.OCR_ENABLED &&
          shouldUseOcr(source.mimeType, source.filename)
        ) {
          const buffer = await ensureBinaryBuffer(source);
          if (buffer) {
            try {
              const pdfLabel = source.filename ?? `doc-${document.docId}`;
              deps.logger.info?.(
                `OCR fallback start | doc=${document.docId} file=${pdfLabel} mime=${source.mimeType ?? "unknown"}`
              );
              const pageImages = await renderPdfPages(buffer, deps.logger, document.docId, pdfLabel);
              deps.logger.info?.(
                `OCR render pages | doc=${document.docId} file=${pdfLabel} pages=${pageImages.length}`
              );
              for (const [index, pageBuffer] of pageImages.entries()) {
                const pageNo = index + 1;
                try {
                  deps.logger.info?.(
                    `OCR page start | doc=${document.docId} file=${pdfLabel} page=${pageNo}`
                  );
                  const pageResult = await deps.ocr.extract({
                    buffer: pageBuffer,
                    filename: `${pdfLabel}.page-${pageNo}.png`,
                    mimeType: "image/png",
                    language: deps.config.OCR_LANG
                  });
                  pageResult.forEach((item) => {
                    item.page = item.page ?? pageNo;
                    item.entities = { ...(item as any).entities, ocr: true } as any;
                  });
                  deps.logger.info?.(
                    `OCR page done | doc=${document.docId} file=${pdfLabel} page=${pageNo} items=${pageResult.length}`
                  );
                  ocrElements.push(...pageResult);
                } catch (pageError) {
                  deps.logger.error?.(
                    `OCR page failed | doc=${document.docId} file=${pdfLabel} page=${pageNo}: ${(pageError as Error).message}`
                  );
                }
              }
              deps.logger.info?.(
                `OCR fallback finished | doc=${document.docId} file=${pdfLabel} items=${ocrElements.length}`
              );
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
                elements = ocrElements;
              }
            } catch (error) {
              deps.logger.error?.(`OCR extraction failed: ${(error as Error).message}`);
            }
          }
        } else {
          deps.logger.info?.(
            `OCR skipped | doc=${document.docId} file=${source.filename ?? "unknown"} reason=${
              shouldUseOcr(source.mimeType, source.filename) ? "OCR disabled or missing adapter" : "mime not OCR-eligible"
            }`
          );
        }
      }
      // 如果仍然没有文本元素且是图片文件，构造图片元素用于后续图片向量化
      if (
        (!elements || !elements.length) &&
        source.binary?.length &&
        source.mimeType?.toLowerCase().startsWith("image/")
      ) {
        elements = [
          {
            id: crypto.randomUUID(),
            type: "image",
            data: source.binary,
            mimeType: source.mimeType,
            text: undefined
          } as ParsedElement
        ];
      }
        // 仍然无内容，标记失败但不中断整个 worker；由队列适配器决定是否重试
        if (!elements.length) {
          const msg = `Document parsing and OCR produced no content | doc=${document.docId} mime=${source.mimeType ?? "unknown"} file=${source.filename ?? "unknown"}`;
          deps.logger.error?.(msg);
          return { document, elements };
        }
      deps.logger.info?.(
        `Parse+OCR finalized | doc=${document.docId} file=${source.filename ?? "unknown"} elements=${elements.length}`
      );
      return { document, elements };
    },
    async chunkDocument(
      doc: Document,
      elements: ParsedElement[],
      source: SourcePayload
    ): Promise<ChunkFragment[]> {
      const { fragments, sections } = await buildSemanticFragments(doc, elements, source, deps);
      source.semanticSections = sections;
      deps.logger.info?.(
        `Semantic segmentation done | doc=${doc.docId} coarseBlocks=${sections.length} fragments=${fragments.length}`
      );
      return fragments;
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
        deps.logger.warn?.("语义元数据模型未注入，跳过元数据生成");
        return enriched;
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
          // 单段结构/元数据不稳定时，回退为原 chunk（保留 segmentIndex 等标记，长度切分已满足）
          deps.logger.warn?.(
            `Semantic metadata failed, fallback to plain chunk | chunk=${chunk.chunkId}: ${(error as Error).message}`
          );
          results.push(chunk);
        }
      }
      return results;
    },
    async embedChunks(
      doc: Document,
      chunks: Chunk[],
      _source: SourcePayload,
      context?: { fragments: ChunkFragment[] }
    ): Promise<{ entries: Array<{ chunk: Chunk; embedding: Embedding }>; logs?: VectorLogInput[] }> {
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
      if (!success) {
        // 返回失败日志，避免在未入库的 chunk 上写 DB
        return { entries: resolved, logs: buildVectorFailureLogs(chunks, doc, durationMs, providerInfo, metadata) };
      }
      const logs = buildVectorLogs(resolved, doc, durationMs, providerInfo, "success", metadata);
      return { entries: resolved, logs };
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

function buildCoarseBlocks(elements: ParsedElement[], source: SourcePayload): CoarseBlock[] {
  const raw = source.rawText ?? collectSegmenterText(elements, source);
  const lines = raw.split(/\r?\n/).map((line) => line.trim());
  const blocks: CoarseBlock[] = [];
  let current: string[] = [];
  let currentTitle = "";
  const headingRegex = /^(第[一二三四五六七八九十百千]+[章节条]|chapter\s+\d+|chap\.\s*\d+|\d+(\.\d+)+|\d+\s+[A-Z][A-Za-z]+)/i;

  const flushBlock = () => {
    const paragraphText = reflowParagraphs(current);
    if (paragraphText.trim().length) {
      blocks.push({
        title: currentTitle || undefined,
        path: currentTitle ? [currentTitle] : [],
        text: paragraphText
      });
    }
    current = [];
  };

  for (const line of lines) {
    if (!line) {
      // 空行分段
      if (current.length) {
        current.push(""); // 保留段落断点
      }
      continue;
    }
    const isHeading = headingRegex.test(line) || line.length <= 12;
    if (isHeading) {
      // 遇到新章节标题，先结束上一块
      if (current.length) {
        flushBlock();
      }
      currentTitle = line;
      continue;
    }
    current.push(line);
  }

  if (current.length) {
    flushBlock();
  }

  return blocks.length ? blocks : [{ text: reflowParagraphs(lines), path: [] }];
}

function buildFallbackSection(
  doc: Document,
  block: CoarseBlock,
  order: number
): { section: DocumentSection; content: string } | null {
  const content = (block.text ?? "").trim();
  if (!content.length) return null;
  return {
    section: {
      sectionId: crypto.randomUUID(),
      docId: doc.docId,
      parentSectionId: undefined,
      title: block.title?.trim() || `Section ${order + 1}`,
      summary: content.slice(0, 240),
      level: Math.max(block.path.length + 1, 1),
      path: block.path,
      order,
      tags: [],
      keywords: [],
      createdAt: new Date().toISOString()
    },
    content
  };
}

function reflowParagraphs(lines: string[]): string {
  const paragraphs: string[] = [];
  let buffer = "";

  const pushBuffer = () => {
    const trimmed = buffer.trim();
    if (trimmed.length) {
      paragraphs.push(trimmed);
    }
    buffer = "";
  };

  for (const line of lines) {
    if (!line) {
      pushBuffer();
      continue;
    }
    // 过滤极短行（常见标题/编号），保留为段落边界但不入正文
    if (line.length <= 6) {
      pushBuffer();
      continue;
    }
    // 处理英文连字符换行：结尾 "-" 且下一个字母开头则直接连接
    if (line.endsWith("-")) {
      buffer += line.slice(0, -1);
      continue;
    }
    if (buffer.length) {
      buffer += buffer.endsWith("-") ? "" : " ";
    }
    buffer += line;
  }
  pushBuffer();
  return paragraphs.join("\n\n");
}

async function renderPdfPages(
  buffer: Uint8Array,
  logger: WorkerDependencies["logger"],
  docId: string,
  fileLabel: string
): Promise<Uint8Array[]> {
  const images: Uint8Array[] = [];
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs") as typeof import("pdfjs-dist/legacy/build/pdf.mjs");
    // 在 Bun/ESM 环境下优先禁用独立 worker，避免路径解析/加载问题
    // @ts-ignore
    pdfjs.GlobalWorkerOptions.workerSrc = undefined;
    // @ts-ignore
    pdfjs.GlobalWorkerOptions.workerPort = null;
    logger?.info?.(`PDF render start | doc=${docId} file=${fileLabel}`);
    const { createCanvas } = await import("@napi-rs/canvas");
    const loadingTask = pdfjs.getDocument({ data: buffer, useWorker: false });
    const pdf: PDFDocumentProxy = await loadingTask.promise;
    const pageCount = pdf.numPages;
    const scale = 1.5;
    logger?.info?.(`PDF render pages | doc=${docId} file=${fileLabel} pages=${pageCount}`);
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      logger?.info?.(`PDF render page start | doc=${docId} file=${fileLabel} page=${pageNum}`);
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(viewport.width, viewport.height);
      const context = canvas.getContext("2d");
      await page.render({ canvasContext: context as any, viewport }).promise;
      logger?.info?.(`PDF render page done | doc=${docId} file=${fileLabel} page=${pageNum}`);
      images.push(canvas.toBuffer("image/png"));
    }
    logger?.info?.(`PDF render success | doc=${docId} file=${fileLabel} pages=${images.length}`);
  } catch (error) {
    logger?.error?.(
      `PDF render failed | doc=${docId} file=${fileLabel}: ${(error as Error).message}`
    );
    return [];
  }
  return images;
}

function estimateTokens(text: string): number {
  if (!text || !text.trim()) return 0;
  // 简单估算：按空白分词计数
  return text.trim().split(/\s+/).length;
}

function splitSentences(text: string): string[] {
  // 尽量在句末标点处分段，避免在公式/代码/列表中间断开
  return text
    .split(/(?<=[。！？!?.])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitParagraphs(text: string): string[] {
  // 先处理英文换行连字符，将 "hyphen-\nated" 还原为 "hyphenated"
  const normalized = text.replace(/-\s*\n\s*/g, "");
  return normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function isListItem(text: string): boolean {
  return /^[\-\*\u2022]\s+/.test(text) || /^[0-9]+\.\s+/.test(text);
}

function sanitizeText(input: string | undefined | null): string {
  if (!input) return "";
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

function sanitizeChunk(chunk: Chunk): Chunk {
  return {
    ...chunk,
    sectionTitle: sanitizeString(chunk.sectionTitle),
    semanticTitle: sanitizeString(chunk.semanticTitle),
    contentText: sanitizeString(chunk.contentText),
    contextSummary: sanitizeString(chunk.contextSummary),
    topicLabels: chunk.topicLabels?.map(sanitizeString),
    semanticTags: chunk.semanticTags?.map(sanitizeString),
    topics: chunk.topics?.map(sanitizeString),
    keywords: chunk.keywords?.map(sanitizeString),
    parentSectionPath: chunk.parentSectionPath?.map(sanitizeString),
    hierPath: chunk.hierPath?.map(sanitizeString)
  };
}

function sanitizeSection(section: DocumentSection): DocumentSection {
  return {
    ...section,
    title: sanitizeString(section.title),
    summary: sanitizeString(section.summary),
    path: section.path?.map(sanitizeString),
    tags: section.tags?.map(sanitizeString),
    keywords: section.keywords?.map(sanitizeString)
  };
}

function sanitizeDocument(doc: Document): Document {
  return {
    ...doc,
    title: sanitizeString(doc.title),
    sourceUri: sanitizeString(doc.sourceUri),
    tags: doc.tags?.map(sanitizeString)
  };
}

function buildLengthBoundSegments(
  doc: Document,
  elements: ParsedElement[],
  maxTokens: number,
  logger?: WorkerDependencies["logger"]
): ChunkFragment[] {
  const segments: PreSegment[] = [];
  // 预处理：合并元素，抽取标题/page 信息
  for (const el of elements) {
    const text = sanitizeText(el.text ?? "").trim();
    const headingTitle =
      sanitizeText((el.metadata?.heading as string | undefined) ?? undefined) ??
      sanitizeText((el.metadata?.sectionTitle as string | undefined) ?? undefined);
    const headingLevel = (el.metadata?.level as number | undefined) ?? undefined;
    const heading =
      headingTitle && headingLevel && headingLevel >= 1 && headingLevel <= 6
        ? { title: headingTitle, level: headingLevel as HeadingLevel }
        : undefined;
    const paragraphs = text.length ? splitParagraphs(text) : [];
    const filteredParas = paragraphs
      .map((p) => sanitizeText(p))
      .filter((para) => estimateTokens(para) >= 1);
    if (filteredParas.length) {
      filteredParas.forEach((para, idx) =>
        segments.push({
          text: para,
          heading: idx === 0 ? heading : undefined,
          page: el.page
        })
      );
    } else if (heading) {
      // 保留标题作为分界，即便当前元素无文本
      segments.push({
        text: "",
        heading,
        page: el.page
      });
    }
  }

  const result: ChunkFragment[] = [];
  let segmentIndex = 0;
  let buffer = "";
  let bufferHeading: PreSegment["heading"];
  let bufferPage: number | undefined;
  const flush = () => {
    if (!buffer.trim().length) return;
    const clean = sanitizeText(buffer);
    const chunkId = crypto.randomUUID();
    const hierPath = bufferHeading?.title
      ? [`seg_${segmentIndex}`, bufferHeading.title]
      : [`seg_${segmentIndex}`];
    const mergeTag = {
      segmentIndex,
      headingTitle: bufferHeading?.title,
      headingLevel: bufferHeading?.level,
      page: bufferPage
    };
    result.push({
      chunk: ChunkSchema.parse({
        chunkId,
        docId: doc.docId,
        hierPath,
        sectionTitle: bufferHeading?.title,
        semanticTitle: bufferHeading?.title,
        parentSectionPath: hierPath.slice(0, -1),
        contentText: clean.trim(),
        contentType: "text",
        pageNo: bufferPage,
        entities: { ...mergeTag }
      }),
      source: {
        id: chunkId,
        type: "text",
        text: clean.trim(),
        metadata: { ...mergeTag }
      }
    });
    segmentIndex += 1;
    buffer = "";
    bufferHeading = undefined;
    bufferPage = undefined;
  };

  const appendBlock = (block: PreSegment) => {
    const paragraphs = splitParagraphs(block.text || "");
    const paraList = paragraphs.length ? paragraphs : [block.text];

    for (const para of paraList) {
      const listLike = isListItem(para);
      const paraTokens = estimateTokens(para);
      // 如果当前段加上整段超长，优先在段尾断开，避免在句中间
      const tentativePara = buffer ? `${buffer}\n${para}` : para;
      if (listLike && buffer.trim().length) {
        // 列表项与前文分开，避免粘连
        flush();
      }
      if (estimateTokens(tentativePara) > maxTokens && estimateTokens(buffer) > 0) {
        flush();
      }

      if (paraTokens > maxTokens) {
        // 段内继续细分为句子/短语
        const sentences = splitSentences(para);
        const sentenceList = sentences.length ? sentences : [para];
        for (const sentence of sentenceList) {
          const sentenceTokens = estimateTokens(sentence);
          if (sentenceTokens > maxTokens) {
            // 极长句，强拆但保留人类可读的分块：尽量按短句/逗号/空格切
            const phrases = sentence
              // 先按列表/分号/逗号等自然停顿切，避免打断列表/公式/代码块
              .split(/(?<=[，,；;])\s+/)
              .map((p) => p.trim())
              .filter(Boolean);
            for (const phrase of phrases.length ? phrases : [sentence]) {
              // 避免在代码/公式中间断开：若检测到多行代码/公式块，整体作为一段尝试
              if (/(```|\$\$)/.test(phrase)) {
                if (estimateTokens(phrase) > maxTokens) {
                  buffer = buffer ? `${buffer}\n${phrase}` : phrase;
                  flush();
                  continue;
                }
              }
              const words = phrase.split(/\s+/);
              let tmp = "";
              for (const w of words) {
                const next = tmp ? `${tmp} ${w}` : w;
                if (estimateTokens(next) > maxTokens) {
                  if (tmp) {
                    buffer = buffer ? `${buffer}\n${tmp}` : tmp;
                    flush();
                  }
                  tmp = w;
                } else {
                  tmp = next;
                }
              }
              if (tmp) {
                buffer = buffer ? `${buffer}\n${tmp}` : tmp;
              }
            }
            continue;
          }

          const next = buffer ? `${buffer}\n${sentence}` : sentence;
          if (estimateTokens(next) > maxTokens) {
            flush();
            bufferHeading = bufferHeading ?? block.heading;
            bufferPage = bufferPage ?? block.page;
            buffer = sentence;
          } else {
            bufferHeading = bufferHeading ?? block.heading;
            bufferPage = bufferPage ?? block.page;
            buffer = next;
          }
        }
      } else {
        // 段长在限制内，尽量整体放入，超过则在段尾断开
        const next = buffer ? `${buffer}\n${para}` : para;
        if (estimateTokens(next) > maxTokens) {
          flush();
        }
        bufferHeading = bufferHeading ?? block.heading;
        bufferPage = bufferPage ?? block.page;
        buffer = buffer ? `${buffer}\n${para}` : para;
      }
    }
  };

  let lastPage: number | undefined;
  for (const seg of segments) {
    const isStrongBoundary =
      (seg.heading && (seg.heading.level === 1 || seg.heading.level === 2)) ||
      (lastPage !== undefined && seg.page !== undefined && seg.page !== lastPage) ||
      // 避免在列表/代码/公式块中间断开：检测到块前后文本明显分隔时再切
      false;
    if (isStrongBoundary) {
      flush();
    }
    bufferHeading = bufferHeading ?? seg.heading;
    bufferPage = bufferPage ?? seg.page;
    const segTokens = estimateTokens(seg.text);
    if (segTokens >= maxTokens) {
      // 大段再细分（句子/短语优先，避免打断自然段落的语义）
      appendBlock({ ...seg });
      flush();
      bufferHeading = undefined;
      bufferPage = undefined;
    } else {
      const tentative = buffer ? `${buffer}\n${seg.text}` : seg.text;
      if (estimateTokens(tentative) > maxTokens) {
        // 优先在自然段边界切分
        flush();
      }
      bufferHeading = bufferHeading ?? seg.heading;
      bufferPage = bufferPage ?? seg.page;
      buffer = buffer ? `${buffer}\n${seg.text}` : seg.text;
    }
    lastPage = seg.page;
  }
  flush();

  logger?.info?.(`Pre-segmentation done | doc=${doc.docId} segments=${result.length}`);
  return result;
}

function buildSectionsFromFragments(fragments: ChunkFragment[]): DocumentSection[] {
  const sections: DocumentSection[] = [];
  const pathMap = new Map<string, PathNode>();
  let order = 0;

  for (const { chunk } of fragments) {
    const path = chunk.hierPath ?? [];
    let parentId: string | undefined;
    let currentPath: string[] = [];
    const segRoot = path[0] ?? "";
    const segMatch = segRoot.match(/^seg_(\d+)/);
    const segTag = segMatch ? segMatch[0] : undefined;
    const baseTags = segTag ? [segTag] : [];
    path.forEach((title, idx) => {
      currentPath.push(title);
      const key = currentPath.join(">");
      const existing = pathMap.get(key);
      if (existing) {
        parentId = existing.sectionId;
        return;
      }
      const sectionId = crypto.randomUUID();
      const section: DocumentSection = {
        sectionId,
        docId: chunk.docId,
        parentSectionId: parentId,
        title,
        summary: undefined,
        level: idx + 1,
        path: [...currentPath],
        order: order++,
        tags: [...baseTags],
        keywords: [],
        createdAt: new Date().toISOString()
      };
      sections.push(section);
      pathMap.set(key, { key, sectionId });
      parentId = sectionId;
    });
  }

  return sections;
}

function applySemanticMetadata(chunk: Chunk, metadata: SemanticMetadata): Chunk {
  const mergedTopics = mergeTags(chunk.topicLabels ?? [], metadata.topics ?? [], 12);
  const mergedTags = mergeTags(chunk.semanticTags ?? [], metadata.semanticTags ?? [], 12);
  const ner = Array.isArray(metadata.entities) ? metadata.entities : Array.isArray(chunk.nerEntities) ? chunk.nerEntities : undefined;
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
    nerEntities: ner,
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

function materializeChunksFromBlueprints(
  doc: Document,
  blueprints: Array<{ section: DocumentSection; content: string }>,
  maxTokens: number
): ChunkFragment[] {
  const fragments: ChunkFragment[] = [];
  blueprints.forEach(({ section, content }) => {
    const paragraphs = content.split(/\n{2,}/).map((para) => para.trim()).filter(Boolean);
    let buffer = "";
    let order = 0;
    const pushChunk = () => {
      const text = buffer.trim();
      if (!text.length) return;
      const hierPath = [doc.title, ...section.path, section.title];
      const chunk = ChunkSchema.parse({
        chunkId: crypto.randomUUID(),
        docId: doc.docId,
        hierPath,
        sectionTitle: section.title,
        semanticTitle: section.title,
        contentText: text,
        contentType: "text",
        parentSectionId: section.sectionId,
        parentSectionPath: hierPath.slice(0, -1),
        entities: section.level ? { semanticLevel: section.level } : undefined,
        createdAt: new Date().toISOString()
      });
      fragments.push({
        chunk,
        source: {
          id: chunk.chunkId,
          type: "text",
          text,
          metadata: { semanticSectionId: section.sectionId, order: section.order * 1000 + order }
        }
      });
      order += 1;
      buffer = "";
    };

    paragraphs.forEach((para) => {
      const tentative = buffer ? `${buffer}\n${para}` : para;
      if (estimateTokens(tentative) > maxTokens) {
        pushChunk();
        buffer = para;
      } else {
        buffer = tentative;
      }
    });
    pushChunk();
  });
  return fragments;
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
  const blocks = buildCoarseBlocks(elements, source);
  if (!blocks.length) {
    throw new Error("文档内容为空，无法进行语义切分");
  }

  const allSections: DocumentSection[] = [];
  const allBlueprints: Array<{ section: DocumentSection; content: string }> = [];

  for (const block of blocks) {
    let sections: SemanticSection[] = [];
    try {
      sections = await deps.semanticSegmenter({
        document: doc,
        text: block.text,
        parentPath: block.path,
        title: block.title
      });
    } catch (error) {
      deps.logger.error?.(`Semantic segmentation request failed: ${(error as Error).message}`);
      sections = [];
    }
    if (!sections.length) {
      const fallback = buildFallbackSection(doc, block, allSections.length);
      if (fallback) {
        allBlueprints.push(fallback);
        allSections.push(fallback.section);
      }
      continue;
    }
    try {
      const { blueprints, sections: normalized } = normalizeSemanticSections(
        doc,
        sections,
        block.path
      );
      allBlueprints.push(...blueprints);
      allSections.push(...normalized);
    } catch (error) {
      const fallback = buildFallbackSection(doc, block, allSections.length);
      if (fallback) {
        deps.logger.warn?.(
          `Semantic sections normalization failed, fallback to coarse block | doc=${doc.docId} block=${block.title ?? "untitled"}`
        );
        allBlueprints.push(fallback);
        allSections.push(fallback.section);
      }
    }
  }

  if (!allBlueprints.length || !allSections.length) {
    throw new Error("语义切分失败：未生成有效章节或片段");
  }

  const fragments = materializeChunksFromBlueprints(
    doc,
    allBlueprints,
    deps.config.MAX_TOKENS_PER_SEGMENT ?? 900
  );

  return { fragments, sections: allSections };
}

function normalizeSemanticSections(
  doc: Document,
  sections: SemanticSection[],
  parentPath: string[] = []
): { blueprints: Array<{ section: DocumentSection; content: string }>; sections: DocumentSection[] } {
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
      level: section.level ?? Math.max(parentPath.length + normalizedPath.length + 1, 1),
      path: [...parentPath, ...normalizedPath],
      order: index,
      tags: [],
      keywords: [],
      createdAt: new Date().toISOString()
    };
    const key = [...parentPath, ...normalizedPath, title].join(">");
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

  return {
    blueprints,
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
    semanticMetadata: overrides.semanticMetadata ?? generateSemanticMetadataViaModel,
    semanticSegmenter: overrides.semanticSegmenter,
    vectorClient: overrides.vectorClient
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

class Semaphore {
  private queue: Array<() => void> = [];
  private count: number;
  constructor(private readonly limit: number) {
    this.count = limit;
  }
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.count > 0) {
      this.count -= 1;
      try {
        return await fn();
      } finally {
        this.count += 1;
        const next = this.queue.shift();
        next?.();
      }
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    return this.run(fn);
  }
}

const tagSemaphore = new Semaphore(3);

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  const apiKey =
    setting.apiKey ??
    (deps.config as any).OPENAI_API_KEY ??
    process.env.OPENAI_API_KEY ??
    undefined;
  const baseUrl =
    setting.baseUrl ??
    (deps.config as any).OPENAI_API_URL ??
    "https://api.openai.com/v1";

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await tagSemaphore.run(async () =>
        generateTagsViaModel(
          {
            provider: setting.provider,
            baseUrl,
            modelName: setting.modelName,
            apiKey
          },
          {
            title: document.title,
            tags: document.tags,
            snippets,
            language: document.language,
            limit: 8
          }
        )
      );
    } catch (error) {
      lastError = error as Error;
      const isLast = attempt === 3;
      const waitMs = 1000 * Math.pow(2, attempt - 1);
      deps.logger.warn?.(
        `Remote tag generation failed (attempt ${attempt}/3) for ${document.docId}: ${lastError.message}; provider=${setting?.provider ?? "unknown"}, baseUrl=${baseUrl}, model=${setting?.modelName ?? "unknown"}, will ${
          isLast ? "give up" : `retry in ${waitMs}ms`
        }`
      );
      if (isLast) {
        break;
      }
      await delay(waitMs);
    }
  }

  deps.logger.error?.(
    `Remote tag generation failed after retries for ${document.docId}: ${lastError?.message ?? "unknown error"}; provider=${setting?.provider ?? "unknown"}, baseUrl=${baseUrl}, model=${setting?.modelName ?? "unknown"}, hasKey=${Boolean(setting?.apiKey) || Boolean((deps.config as any).OPENAI_API_KEY)}`
  );
  throw lastError ?? new Error("Remote tag generation failed after retries");
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
