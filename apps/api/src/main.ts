import { startApiServer } from "./server";
import { HybridRetriever } from "../../../packages/core/src/retrieval";
import { VectorClient } from "../../../packages/core/src/vector";
import { MetricsRegistry, startMetricsServer } from "../../../packages/tooling/src/metrics";
import { createDataLayer } from "@kb/data";
import { loadConfig } from "../../../packages/core/src/config";

async function bootstrap() {
  const config = loadConfig();
  const dataLayer = createDataLayer(config);
  const vectorClient = new VectorClient({
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
  const retriever = new HybridRetriever({
    vectorClient,
    repo: dataLayer.chunks
  });

  const metrics = new MetricsRegistry();
  const metricsServer = startMetricsServer({
    registry: metrics,
    port: Number(process.env.METRICS_PORT ?? "9464")
  });

  const server = startApiServer({
    port: Number(process.env.API_PORT ?? config.PORT_API ?? 8080),
    authToken: process.env.API_TOKEN ?? "dev-token",
    documents: dataLayer.documents,
    chunks: dataLayer.chunks,
    attachments: dataLayer.attachments,
    queue: dataLayer.queue,
    retriever,
    storage: dataLayer.storage,
    vectorIndex: dataLayer.vectorIndex,
    modelSettings: dataLayer.modelSettings,
    vectorLogs: dataLayer.vectorLogs,
    defaultTenantId: config.DEFAULT_TENANT_ID,
    defaultLibraryId: config.DEFAULT_LIBRARY_ID,
    metrics
  });

  console.log(`API server listening on http://localhost:${server.port}`);
  console.log(`Metrics endpoint at http://localhost:${metricsServer.port}/metrics`);
}

if (import.meta.main && process.env.START_API_SERVER !== "false") {
  bootstrap().catch((error) => {
    console.error("Failed to start API server", error);
    process.exit(1);
  });
}
