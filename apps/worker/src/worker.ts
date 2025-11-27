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
import { resolveLocalModelId } from "../../../packages/tooling/src/models";

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
  const localOverrides = modelSettings
    ? await resolveLocalVectorModelOverrides(config, modelSettings)
    : {};
  const defaultTextModelId =
    localOverrides.embedding ??
    resolveLocalModelId("text", config.MODELS_DIR, config.LOCAL_TEXT_MODEL_ID ?? undefined) ??
    config.LOCAL_TEXT_MODEL_ID ?? undefined;
  const defaultImageModelId =
    resolveLocalModelId("image", config.MODELS_DIR, config.LOCAL_IMAGE_MODEL_ID ?? undefined) ??
    config.LOCAL_IMAGE_MODEL_ID ?? undefined;
  const defaultRerankerModelId =
    localOverrides.rerank ??
    resolveLocalModelId("rerank", config.MODELS_DIR, config.LOCAL_RERANK_MODEL_ID ?? undefined) ??
    config.LOCAL_RERANK_MODEL_ID ?? undefined;
  const vectorClient =
    options.vectorClient ??
    new VectorClient({
      rerankEndpoint: config.RERANK_ENDPOINT,
      imageEndpoint: config.IMAGE_EMBEDDING_ENDPOINT,
      fallbackDim: config.PGVECTOR_DIM,
      enableLocalModels: true,
      localTextModelId: defaultTextModelId ?? undefined,
      localImageModelId: defaultImageModelId ?? undefined,
      localRerankerModelId: defaultRerankerModelId ?? undefined,
      modelCacheDir: config.MODELS_DIR
    });
  const vectorLogs = options.vectorLogs ?? dataLayer.vectorLogs;
  const ocr = options.ocr ?? (await createOcrAdapter(config, modelSettings, options.logger ?? console));
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

async function createOcrAdapter(
  config: AppConfig,
  modelSettings?: ModelSettingsRepository,
  logger?: WorkerLogger
) {
  if (!config.OCR_ENABLED) {
    return undefined;
  }
  // 优先使用模型配置中的 OCR 端点（默认租户/库）
  let endpoint = config.OCR_API_URL;
  let apiKey = config.OCR_API_KEY;
  if (modelSettings) {
    try {
      const ocrSetting =
        (await modelSettings.get(
          config.DEFAULT_TENANT_ID,
          config.DEFAULT_LIBRARY_ID,
          "ocr"
        )) ?? null;
      if (ocrSetting?.baseUrl) {
        endpoint = ocrSetting.baseUrl;
      }
      if (ocrSetting?.apiKey) {
        apiKey = ocrSetting.apiKey;
      }
    } catch (error) {
      logger?.warn?.(`读取 OCR 模型配置失败: ${(error as Error).message}`);
    }
  }
  if (config.OCR_MODE === "local" && config.OCR_LOCAL_COMMAND) {
    return new LocalOcrAdapter({
      command: config.OCR_LOCAL_COMMAND,
      language: config.OCR_LANG,
      encoding: "utf8"
    });
  }
  if ((config.OCR_MODE === "http" && endpoint) || endpoint) {
    return new HttpOcrAdapter({
      endpoint: endpoint!,
      apiKey: apiKey ?? undefined,
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

async function resolveLocalVectorModelOverrides(
  config: AppConfig,
  repo: ModelSettingsRepository
) {
  const tenantId = config.DEFAULT_TENANT_ID;
  const libraryId = config.DEFAULT_LIBRARY_ID;
  const [embeddingSetting, rerankSetting] = await Promise.all([
    repo.get(tenantId, libraryId, "embedding"),
    repo.get(tenantId, libraryId, "rerank")
  ]);
  return {
    embedding: resolveLocalModelOverride(config, embeddingSetting, "text"),
    rerank: resolveLocalModelOverride(config, rerankSetting, "rerank")
  };
}

function resolveLocalModelOverride(
  config: AppConfig,
  setting: Awaited<ReturnType<ModelSettingsRepository["get"]>>,
  role: "text" | "rerank" | "image" | "ocr"
) {
  if (setting?.provider === "local") {
    return (
      resolveLocalModelId(role, config.MODELS_DIR, setting.modelName) ??
      resolveLocalModelId(role, config.MODELS_DIR)
    );
  }
  return undefined;
}
