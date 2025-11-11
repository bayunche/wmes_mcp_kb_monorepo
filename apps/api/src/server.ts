import { serve, Server } from "bun";
import { MetricsRegistry, measureLatency } from "../../../packages/tooling/src/metrics";
import { requireAuth } from "./auth";
import { handleRequest, ApiRoutesDeps } from "./routes";

export interface ApiServerOptions extends ApiRoutesDeps {
  port?: number;
  authToken: string;
  metrics?: MetricsRegistry;
}

export function startApiServer(options: ApiServerOptions): Server {
  const metrics = options.metrics;
  const requestCounter = metrics?.counter("kb_api_requests_total", "Total API requests");
  const errorCounter = metrics?.counter("kb_api_errors_total", "Total API request errors");

  const server = serve({
    port: options.port ?? 0,
    fetch: async (request) => {
      const start = Date.now();
      const url = new URL(request.url);

      if (url.pathname === "/health") {
        requestCounter?.inc();
        const response = await handleRequest(request, options);
        metrics && measureLatency(metrics, "kb_api_request_duration_seconds", "API request duration", start);
        return response;
      }

      try {
        requireAuth(request, options.authToken);
      } catch {
        errorCounter?.inc();
        metrics && measureLatency(metrics, "kb_api_request_duration_seconds", "API request duration", start);
        return new Response("Unauthorized", { status: 401 });
      }

      try {
        requestCounter?.inc();
        const response = await handleRequest(request, options);
        metrics && measureLatency(metrics, "kb_api_request_duration_seconds", "API request duration", start);
        return response;
      } catch (error) {
        errorCounter?.inc();
        metrics && measureLatency(metrics, "kb_api_request_duration_seconds", "API request duration", start);
        return new Response("Internal Server Error", { status: 500, statusText: (error as Error).message });
      }
    }
  });

  return server;
}
