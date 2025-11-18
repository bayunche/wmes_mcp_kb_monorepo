import { serve, Server } from "bun";
import { MetricsRegistry, measureLatency, createLogger } from "@kb/tooling";
import { requireAuth } from "./auth";
import { handleRequest, ApiRoutesDeps } from "./routes";

const defaultCorsOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];
const configuredOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = configuredOrigins.length ? configuredOrigins : defaultCorsOrigins;
const allowAnyOrigin = allowedOrigins.includes("*");

function resolveCorsOrigin(requestOrigin: string | null): string | undefined {
  if (allowAnyOrigin) {
    return "*";
  }
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }
  return allowedOrigins[0];
}

function buildCorsHeaders(request: Request): Headers {
  const originHeader = request.headers.get("origin");
  const allowOrigin = resolveCorsOrigin(originHeader);
  const headers = new Headers({
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type,x-tenant-id,x-library-id",
    "Access-Control-Max-Age": "86400"
  });
  if (allowOrigin) {
    headers.set("Access-Control-Allow-Origin", allowOrigin);
    if (allowOrigin !== "*") {
      headers.set("Access-Control-Allow-Credentials", "true");
    }
  }
  return headers;
}

function applyCors(response: Response, request: Request): Response {
  const headers = buildCorsHeaders(request);
  headers.forEach((value, key) => {
    response.headers.set(key, value);
  });
  return response;
}

export interface ApiServerOptions extends ApiRoutesDeps {
  port?: number;
  authToken: string;
  metrics?: MetricsRegistry;
}

export function startApiServer(options: ApiServerOptions): Server {
  const metrics = options.metrics;
  const requestCounter = metrics?.counter("kb_api_requests_total", "Total API requests");
  const errorCounter = metrics?.counter("kb_api_errors_total", "Total API request errors");
  const logger = createLogger("api");
  const maxBodySizeBytes = (() => {
    if (process.env.API_MAX_BODY_BYTES) {
      return Number(process.env.API_MAX_BODY_BYTES);
    }
    const mb = Number(process.env.API_MAX_BODY_MB ?? "1024");
    return mb * 1024 * 1024;
  })();

  const server = serve({
    port: options.port ?? 0,
    maxRequestBodySize: Number.isFinite(maxBodySizeBytes) && maxBodySizeBytes > 0 ? maxBodySizeBytes : undefined,
    fetch: async (request) => {
      const start = Date.now();
      const url = new URL(request.url);

      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: buildCorsHeaders(request) });
      }

      if (url.pathname === "/health") {
        requestCounter?.inc();
        const response = await handleRequest(request, options);
        const corsResponse = applyCors(response, request);
        metrics && measureLatency(metrics, "kb_api_request_duration_seconds", "API request duration", start);
        logger.request(request, corsResponse.status, Date.now() - start);
        return corsResponse;
      }

      if (url.pathname === "/metrics") {
        if (!metrics) {
          const response = applyCors(new Response("Metrics registry not configured", { status: 404 }), request);
          logger.request(request, response.status, Date.now() - start);
          return response;
        }
        const payload = metrics.toPrometheus();
        const response = new Response(payload, {
          status: 200,
          headers: { "content-type": "text/plain; charset=utf-8" }
        });
        const corsResponse = applyCors(response, request);
        logger.request(request, corsResponse.status, Date.now() - start);
        return corsResponse;
      }

      try {
        requireAuth(request, options.authToken);
      } catch {
        errorCounter?.inc();
        metrics && measureLatency(metrics, "kb_api_request_duration_seconds", "API request duration", start);
        const response = applyCors(new Response("Unauthorized", { status: 401 }), request);
        logger.request(request, response.status, Date.now() - start);
        return response;
      }

      try {
        requestCounter?.inc();
        const response = await handleRequest(request, options);
        const corsResponse = applyCors(response, request);
        metrics && measureLatency(metrics, "kb_api_request_duration_seconds", "API request duration", start);
        logger.request(request, corsResponse.status, Date.now() - start);
        return corsResponse;
      } catch (error) {
        errorCounter?.inc();
        metrics && measureLatency(metrics, "kb_api_request_duration_seconds", "API request duration", start);
        logger.error(`${request.method} ${url.pathname}`, error);
        const response = applyCors(
          new Response("Internal Server Error", { status: 500, statusText: (error as Error).message }),
          request
        );
        logger.request(request, response.status, Date.now() - start);
        return response;
      }
    }
  });

  return server;
}
