import { createMcpServer, handleMcpRequest } from "./index";
import { McpToolContext } from "./types";
import { loadConfig } from "../../../packages/core/src/config";
import { createLogger } from "@kb/tooling";

async function bootstrap() {
  const config = loadConfig({ envFile: process.env.ENV_FILE ?? ".env" });
  const server = createMcpServer({ config });
  const port = Number(process.env.PORT_MCP ?? config.PORT_MCP ?? 9090);
  const defaultTenant = config.DEFAULT_TENANT_ID ?? "default";
  const logger = createLogger("mcp");

  const listener = Bun.serve({
    port,
    fetch: async (request) => {
      const start = Date.now();
      if (request.method !== "POST") {
        const response = new Response("Method Not Allowed", { status: 405 });
        logger.request(request, response.status, Date.now() - start);
        return response;
      }
      const url = new URL(request.url);
      const match = url.pathname.match(/^\/mcp\/(.+)$/);
      if (!match) {
        const response = new Response("Not Found", { status: 404 });
        logger.request(request, response.status, Date.now() - start);
        return response;
      }
      const body = await request.json().catch(() => ({}));
      const tenantHeader = request.headers.get("x-tenant-id")?.trim();
      const libraryHeader = request.headers.get("x-library-id")?.trim();
      const ctx: McpToolContext = {
        requestId: crypto.randomUUID(),
        tenantId: tenantHeader && tenantHeader.length ? tenantHeader : defaultTenant,
        libraryId:
          libraryHeader && libraryHeader.length ? libraryHeader : config.DEFAULT_LIBRARY_ID ?? "default"
      };
      const toolName = match[1].startsWith("kb.") ? match[1] : `kb.${match[1]}`;
      try {
        const result = await handleMcpRequest(server, toolName, body, ctx);
        const response = new Response(JSON.stringify(result), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
        logger.request(request, response.status, Date.now() - start);
        return response;
      } catch (error) {
        logger.error(`${request.method} ${url.pathname}`, error);
        const response = new Response(
          JSON.stringify({ message: (error as Error).message }),
          {
            status: 400,
            headers: { "content-type": "application/json" }
          }
        );
        logger.request(request, response.status, Date.now() - start);
        return response;
      }
    }
  });

  logger.info(`MCP server listening on http://localhost:${listener.port}/mcp/*`);
}

if (import.meta.main && process.env.START_MCP_SERVER === "true") {
  bootstrap().catch((error) => {
    console.error("Failed to start MCP server", error);
    process.exit(1);
  });
}
