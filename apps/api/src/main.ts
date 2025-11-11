import { startApiServer } from "./server";
import { InMemoryApiRepository } from "./repository/in-memory";
import { HybridRetriever, InMemoryChunkRepository } from "../../packages/core/src/retrieval";
import { VectorClient } from "../../packages/core/src/vector";
import { MetricsRegistry, startMetricsServer } from "../../packages/tooling/src/metrics";

async function bootstrap() {
  const repo = new InMemoryApiRepository();
  const retriever = new HybridRetriever({
    vectorClient: new VectorClient(),
    repo: new InMemoryChunkRepository([])
  });

  const metrics = new MetricsRegistry();
  const metricsServer = startMetricsServer({
    registry: metrics,
    port: Number(process.env.METRICS_PORT ?? "9464")
  });

  const server = startApiServer({
    port: Number(process.env.API_PORT ?? "8080"),
    authToken: process.env.API_TOKEN ?? "dev-token",
    repo,
    retriever,
    metrics
  });

  console.log(`API server listening on http://localhost:${server.port}`);
  console.log(`Metrics endpoint at http://localhost:${metricsServer.port}/metrics`);
}

if (import.meta.main && process.env.START_API_SERVER === "true") {
  bootstrap().catch((error) => {
    console.error("Failed to start API server", error);
    process.exit(1);
  });
}
