import { createMcpServer, handleMcpRequest } from "./index";
import { McpToolContext } from "./types";
import { loadConfig } from "../../../packages/core/src/config";

async function bootstrap() {
  const config = loadConfig({ envFile: process.env.ENV_FILE ?? ".env" });
  const server = createMcpServer({ config });
  const port = Number(process.env.PORT_MCP ?? config.PORT_MCP ?? 9090);
  const defaultTenant = config.DEFAULT_TENANT_ID ?? "default";

  const listener = Bun.serve({
    port,
    fetch: async (request) => {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }
      const url = new URL(request.url);
      const match = url.pathname.match(/^\/mcp\/(.+)$/);
      if (!match) {
        return new Response("Not Found", { status: 404 });
      }
      const body = await request.json().catch(() => ({}));
      const tenantHeader = request.headers.get("x-tenant-id")?.trim();
      const ctx: McpToolContext = {
        requestId: crypto.randomUUID(),
        tenantId: tenantHeader && tenantHeader.length ? tenantHeader : defaultTenant
      };
      const toolName = match[1].startsWith("kb.") ? match[1] : `kb.${match[1]}`;
      try {
        const result = await handleMcpRequest(server, toolName, body, ctx);
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      } catch (error) {
        return new Response(
          JSON.stringify({ message: (error as Error).message }),
          {
            status: 400,
            headers: { "content-type": "application/json" }
          }
        );
      }
    }
  });

  console.log(`MCP server listening on http://localhost:${listener.port}/mcp/*`);
}

if (import.meta.main && process.env.START_MCP_SERVER === "true") {
  bootstrap().catch((error) => {
    console.error("Failed to start MCP server", error);
    process.exit(1);
  });
}
