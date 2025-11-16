import { test, expect } from "@playwright/test";

const API_BASE = process.env.API_BASE ?? "http://localhost:8080";
const API_TOKEN = process.env.API_TOKEN ?? "dev-token";

test.describe.configure({ mode: "serial" });

const authHeaders = {
  Authorization: `Bearer ${API_TOKEN}`,
  "content-type": "application/json"
};

test.describe("Knowledge base E2E", () => {
  test.skip(!process.env.E2E_ENABLED, "Enable by setting E2E_ENABLED=1 and启动 API/Worker 环境");

  test("上传 + 检索 + MCP 预览", async ({ request }) => {
    const docPayload = {
      docId: crypto.randomUUID(),
      title: "E2E 合同",
      ingestStatus: "uploaded",
      tenantId: "default"
    };

    const createResp = await request.post(`${API_BASE}/documents`, {
      headers: authHeaders,
      data: docPayload
    });
    expect(createResp.ok()).toBeTruthy();

    // TODO：真实场景应等待 worker 完成索引，此处假设 worker 已在后台运行。

    const searchResp = await request.post(`${API_BASE}/search`, {
      headers: authHeaders,
      data: { query: "付款", limit: 1 }
    });
    expect(searchResp.ok()).toBeTruthy();
    const json = await searchResp.json();
    expect(json.total).toBeGreaterThan(0);

    const chunkId = json.results[0].chunk.chunkId;

    // MCP 工具（通过 API 的代理接口或 MCP Inspector 调用）
    // 这里仅示例 HTTP 方式，实际 MCP 集成可使用 `handleMcpRequest`
    const relatedResp = await request.post(`${API_BASE}/mcp/related`, {
      headers: authHeaders,
      data: { chunkId }
    });
    expect(relatedResp.status()).toBeLessThan(500);

    const previewResp = await request.post(`${API_BASE}/mcp/preview`, {
      headers: authHeaders,
      data: { chunkId }
    });
    expect(previewResp.ok()).toBeTruthy();
  });
});
