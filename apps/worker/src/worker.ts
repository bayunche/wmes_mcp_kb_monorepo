import { loadConfig, AppConfig } from "../../../packages/core/src/config";
import { IngestionTask, Document } from "@kb/shared-schemas";
import { handleQueueMessage, resolveDependencies } from "./pipeline";
import { WorkerDependencies, WorkerLogger } from "./types";
import { MetricsRegistry } from "../../../packages/tooling/src/metrics";
import { createDataLayer, DataLayer } from "@kb/data";
import type { QueueAdapter, ModelSettingsRepository } from "@kb/data";
import {
  BasicTextParser,
  CompositeParser,
  UnstructuredParser,
  AdaptiveChunkFactory,
  OfficeParser,
  type DocumentParser
} from "../../../packages/core/src/parsing";
import { VectorClient } from "../../../packages/core/src/vector";
import { HttpOcrAdapter, LocalOcrAdapter } from "../../../packages/core/src/ocr";
import { generateSemanticMetadataViaModel } from "../../../packages/core/src/semantic-metadata";
import { generateStructureViaModel } from "../../../packages/core/src/semantic-structure";

export interface StartWorkerOptions extends Partial<WorkerDependencies> {
  dataLayer?: DataLayer;
  metrics?: MetricsRegistry;
}

export async function startWorker(options: StartWorkerOptions = {}): Promise<QueueAdapter> {
  const config = options.config ?? loadConfig();
  const dataLayer = options.dataLayer ?? createDataLayer(config);
  const queue = options.queue ?? dataLayer.queue;
  const parser = options.parser ?? createParserFromConfig(config);
  const modelSettings = options.modelSettings ?? dataLayer.modelSettings;
  const chunkFactory =
    options.chunkFactory ??
    new AdaptiveChunkFactory({
      maxChars: config.CHUNK_MAX_CHARS,
      overlapChars: config.CHUNK_OVERLAP_CHARS
    });
  if (!config.LOCAL_EMBEDDING_ENABLED) {
    throw new Error("LOCAL_EMBEDDING_ENABLED 必须为 true 才能启动 Worker");
  }
  if (!config.LOCAL_TEXT_MODEL_ID) {
    throw new Error("LOCAL_TEXT_MODEL_ID 未配置，无法加载本地向量模型");
  }
  const vectorClient =
    options.vectorClient ??
    new VectorClient({
      rerankEndpoint: config.RERANK_ENDPOINT,
      imageEndpoint: config.IMAGE_EMBEDDING_ENDPOINT,
      fallbackDim: config.PGVECTOR_DIM,
      enableLocalModels: true,
      localTextModelId: config.LOCAL_TEXT_MODEL_ID,
      localImageModelId: config.LOCAL_IMAGE_MODEL_ID ?? undefined,
      modelCacheDir: config.MODELS_DIR
    });
  const vectorLogs = options.vectorLogs ?? dataLayer.vectorLogs;
  const ocr = options.ocr ?? createOcrAdapter(config);
  const semanticMetadata = options.semanticMetadata ?? generateSemanticMetadataViaModel;
  const semanticSegmenter =
    options.semanticSegmenter ??
    createSemanticSegmenter(config, modelSettings, options.logger ?? console);
  const deps = resolveDependencies({
    ...options,
    config,
    queue,
    knowledgeWriter: options.knowledgeWriter ?? dataLayer.knowledgeWriter,
    documents: options.documents ?? dataLayer.documents,
    modelSettings,
    storage: options.storage ?? dataLayer.storage,
    parser,
    chunkFactory,
    vectorClient,
    vectorLogs,
    ocr,
    semanticMetadata,
    semanticSegmenter,
    logger: options.logger ?? console,
    metrics: options.metrics
  });

  await queue.subscribe(async (task: IngestionTask) => {
    await handleQueueMessage(task, deps);
  });

  deps.logger.info?.("Worker subscription ready.");
  return queue;
}

function createParserFromConfig(config: AppConfig) {
  const parsers: DocumentParser[] = [];
  const officeParser = new OfficeParser();
  if (config.UNSTRUCTURED_API_URL) {
    parsers.push(
      new UnstructuredParser({
        url: config.UNSTRUCTURED_API_URL,
        apiKey: config.UNSTRUCTURED_API_KEY,
        timeoutMs: 30000
      })
    );
  }
  parsers.push(officeParser);
  parsers.push(new BasicTextParser());
  return parsers.length === 1 ? parsers[0] : new CompositeParser(parsers);
}

function createOcrAdapter(config: AppConfig) {
  if (!config.OCR_ENABLED) {
    return undefined;
  }
  if (config.OCR_MODE === "local" && config.OCR_LOCAL_COMMAND) {
    return new LocalOcrAdapter({
      command: config.OCR_LOCAL_COMMAND,
      language: config.OCR_LANG
    });
  }
  if (config.OCR_MODE === "http" && config.OCR_API_URL) {
    return new HttpOcrAdapter({
      endpoint: config.OCR_API_URL,
      apiKey: config.OCR_API_KEY,
      language: config.OCR_LANG
    });
  }
  if (config.OCR_MODE === "auto") {
    if (config.OCR_LOCAL_COMMAND) {
      return new LocalOcrAdapter({ command: config.OCR_LOCAL_COMMAND, language: config.OCR_LANG });
    }
    if (config.OCR_API_URL) {
      return new HttpOcrAdapter({
        endpoint: config.OCR_API_URL,
        apiKey: config.OCR_API_KEY,
        language: config.OCR_LANG
      });
    }
  }
  return undefined;
}

function createSemanticSegmenter(
  config: AppConfig,
  repo: ModelSettingsRepository | undefined,
  logger: WorkerLogger
) {
  if (!repo) {
    return undefined;
  }
  return async ({ document, text }: { document: Document; text: string }) => {
    const tenantId = document.tenantId ?? config.DEFAULT_TENANT_ID;
    const libraryId = document.libraryId ?? config.DEFAULT_LIBRARY_ID;
    const setting =
      (await repo.get(tenantId, libraryId, "structure")) ??
      (libraryId !== config.DEFAULT_LIBRARY_ID
        ? await repo.get(tenantId, config.DEFAULT_LIBRARY_ID, "structure")
        : null);
    if (!setting) {
      return [];
    }
    try {
      return await generateStructureViaModel(
        {
          provider: setting.provider,
          baseUrl: setting.baseUrl,
          modelName: setting.modelName,
          apiKey: setting.apiKey
        },
        {
          title: document.title,
          language: document.language,
          text
        }
      );
    } catch (error) {
      logger.error?.(`Semantic segmentation request failed: ${(error as Error).message}`);
      return [];
    }
  };
}
