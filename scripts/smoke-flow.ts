/**
 * Bun 脚本：模拟完整流程烟测
 * 步骤：health -> upload -> documents -> chunks -> search -> mcp search -> stats -> vector logs
 * 环境变量：
 *   API_BASE   默认 http://localhost:8080
 *   API_TOKEN  默认 dev-token
 *   TENANT_ID  默认 default
 *   LIBRARY_ID 默认 default
 */

const API_BASE = process.env.API_BASE ?? "http://localhost:8080";
const API_TOKEN = process.env.API_TOKEN ?? "dev-token";
const TENANT_ID = process.env.TENANT_ID ?? "default";
const LIBRARY_ID = process.env.LIBRARY_ID ?? "default";

function url(path: string) {
  return `${API_BASE}${path}`;
}

function authHeaders(extra?: HeadersInit): HeadersInit {
  return {
    Authorization: `Bearer ${API_TOKEN}`,
    "x-tenant-id": TENANT_ID,
    "x-library-id": LIBRARY_ID,
    ...extra
  };
}

async function expectOk(response: Response, label: string) {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${label} failed: ${response.status} ${response.statusText} ${text}`);
  }
  return response;
}

async function main() {
  console.log("Smoke flow start");

  // 1) health
  await expectOk(await fetch(url("/health")), "health");
  console.log("✓ health");

  // 2) upload文件（支持本地文件路径或内联文本）
  const form = new FormData();
  form.append("title", "smoke-demo");
  form.append("tenantId", TENANT_ID);
  form.append("libraryId", LIBRARY_ID);
  const filePath = process.env.SMOKE_FILE;
  if (filePath) {
    const data = await Bun.file(filePath).arrayBuffer();
    form.append("files", new File([data], filePath.split(/[\\/]/).pop() ?? "smoke.bin"));
  } else {
    form.append(
      "files",
      new File([new TextEncoder().encode("Hello KB\nThis is a smoke test document.")], "smoke.txt", {
        type: "text/plain"
      })
    );
  }
  const uploadRes = await expectOk(
    await fetch(url("/upload"), { method: "POST", headers: authHeaders(), body: form }),
    "upload"
  );
  const uploadJson = await uploadRes.json();
  const docId: string = uploadJson.items?.[0]?.docId;
  if (!docId) throw new Error("upload did not return docId");
  console.log("✓ upload", docId);

  // 3) list documents
  const listRes = await expectOk(
    await fetch(url(`/documents?tenantId=${TENANT_ID}&libraryId=${LIBRARY_ID}`), {
      headers: authHeaders()
    }),
    "documents list"
  );
  const listJson = await listRes.json();
  console.log(`✓ documents list (${listJson.items?.length ?? 0})`);

  // 4) chunks
  const chunksRes = await expectOk(
    await fetch(url(`/documents/${docId}/chunks`), { headers: authHeaders() }),
    "chunks list"
  );
  const chunksJson = await chunksRes.json();
  console.log(`✓ chunks (${chunksJson.items?.length ?? 0})`);

  // 5) search
  const searchRes = await expectOk(
    await fetch(url("/search"), {
      method: "POST",
      headers: { ...authHeaders({ "content-type": "application/json" }) },
      body: JSON.stringify({ query: "smoke", limit: 5 })
    }),
    "search"
  );
  const searchJson = await searchRes.json();
  console.log(`✓ search results ${searchJson.results?.length ?? 0}`);

  // 6) mcp search
  const mcpRes = await expectOk(
    await fetch(url("/mcp/search"), {
      method: "POST",
      headers: { ...authHeaders({ "content-type": "application/json" }) },
      body: JSON.stringify({ query: "smoke", limit: 3 })
    }),
    "mcp search"
  );
  const mcpJson = await mcpRes.json();
  console.log(`✓ mcp search results ${mcpJson.results?.length ?? 0}`);

  // 7) document structure (may be empty if segmentation not run)
  const structRes = await expectOk(
    await fetch(url(`/documents/${docId}/structure`), { headers: authHeaders() }),
    "document structure"
  );
  const structJson = await structRes.json();
  console.log(`✓ structure sections ${structJson.sections?.length ?? 0}`);

  // 8) stats
  const statsRes = await expectOk(
    await fetch(url(`/stats?tenantId=${TENANT_ID}&libraryId=${LIBRARY_ID}`), { headers: authHeaders() }),
    "stats"
  );
  const statsJson = await statsRes.json();
  console.log(`✓ stats docs=${statsJson.documents} chunks=${statsJson.chunks ?? "?"} pending=${statsJson.pendingJobs ?? "?"}`);

  // 9) vector logs
  const logsRes = await expectOk(await fetch(url("/vector-logs"), { headers: authHeaders() }), "vector logs");
  const logsJson = await logsRes.json();
  console.log(`✓ vector logs ${logsJson.items?.length ?? 0}`);

  console.log("Smoke flow done");
}

main().catch((error) => {
  console.error("Smoke flow failed:", error);
  process.exit(1);
});
