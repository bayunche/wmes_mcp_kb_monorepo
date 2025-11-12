import { loadConfig, AppConfig } from "../../../packages/core/src/config";
import { IngestionTask } from "@kb/shared-schemas";
import { handleQueueMessage, resolveDependencies } from "./pipeline";
import { WorkerDependencies } from "./types";
import { MetricsRegistry } from "../../../packages/tooling/src/metrics";
import { createDataLayer, DataLayer } from "@kb/data";
import type { QueueAdapter } from "@kb/data";
import {
  BasicTextParser,
  CompositeParser,
  SimpleChunkFactory,
  UnstructuredParser
} from "../../../packages/core/src/parsing";
import { VectorClient } from "../../../packages/core/src/vector";

export interface StartWorkerOptions extends Partial<WorkerDependencies> {
  dataLayer?: DataLayer;
  metrics?: MetricsRegistry;
}

export async function startWorker(options: StartWorkerOptions = {}): Promise<QueueAdapter> {
  const config = options.config ?? loadConfig();
  const dataLayer = options.dataLayer ?? createDataLayer(config);
  const queue = options.queue ?? dataLayer.queue;
  const parser = options.parser ?? createParserFromConfig(config);
  const chunkFactory = options.chunkFactory ?? new SimpleChunkFactory();
  const vectorClient =
    options.vectorClient ??
    new VectorClient({
      textEndpoint: config.TEXT_EMBEDDING_ENDPOINT,
      rerankEndpoint: config.RERANK_ENDPOINT,
      imageEndpoint: config.IMAGE_EMBEDDING_ENDPOINT,
      apiKey: config.VECTOR_API_KEY,
      fallbackDim: config.PGVECTOR_DIM,
      enableLocalModels: config.LOCAL_EMBEDDING_ENABLED,
      localTextModelId: config.LOCAL_TEXT_MODEL_ID ?? undefined,
      localImageModelId: config.LOCAL_IMAGE_MODEL_ID ?? undefined,
      modelCacheDir: config.MODELS_DIR
    });
  const deps = resolveDependencies({
    ...options,
    config,
    queue,
    knowledgeWriter: options.knowledgeWriter ?? dataLayer.knowledgeWriter,
    documents: options.documents ?? dataLayer.documents,
    storage: options.storage ?? dataLayer.storage,
    parser,
    chunkFactory,
    vectorClient,
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
  const parsers = [];
  if (config.UNSTRUCTURED_API_URL) {
    parsers.push(
      new UnstructuredParser({
        url: config.UNSTRUCTURED_API_URL,
        apiKey: config.UNSTRUCTURED_API_KEY,
        timeoutMs: 30000
      })
    );
  }
  parsers.push(new BasicTextParser());
  return parsers.length === 1 ? parsers[0] : new CompositeParser(parsers);
}
