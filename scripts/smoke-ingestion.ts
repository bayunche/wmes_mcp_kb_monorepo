/**
 * 冒烟：上传 -> 轮询入库状态 -> 拉取 chunks/结构
 * 环境变量：
 *   API_BASE   默认 http://localhost:8080
 *   API_TOKEN  默认 dev-token
 *   TENANT_ID  默认 default
 *   LIBRARY_ID 默认 default
 *   SMOKE_FILE 可选，本地文件路径；若缺失则用内嵌文本
 */

const API_BASE = process.env.API_BASE ?? "http://localhost:8080";
const API_TOKEN = process.env.API_TOKEN ?? "dev-token";
const TENANT_ID = process.env.TENANT_ID ?? "default";
const LIBRARY_ID = process.env.LIBRARY_ID ?? "default";
const SMOKE_FILE = process.env.SMOKE_FILE;

const headers = {
  Authorization: `Bearer ${API_TOKEN}`,
  "x-tenant-id": TENANT_ID,
  "x-library-id": LIBRARY_ID
};

function url(path: string) {
  return `${API_BASE}${path}`;
}

async function expectOk(res: Response, label: string) {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${label} 失败: ${res.status} ${res.statusText} ${text}`);
  }
  return res;
}

async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function upload(): Promise<string> {
  const form = new FormData();
  form.append("title", "smoke-ingestion");
  form.append("tenantId", TENANT_ID);
  form.append("libraryId", LIBRARY_ID);

  if (SMOKE_FILE) {
    const data = await Bun.file(SMOKE_FILE).arrayBuffer();
    const name = SMOKE_FILE.split(/[\\/]/).pop() ?? "smoke.bin";
    form.append("files", new File([data], name));
  } else {
    const text = new TextEncoder().encode("冒烟测试\n这是一段用于切分的文本，包含两段。\n第二段用于验证分块与摘要。\n");
    form.append("files", new File([text], "smoke.txt", { type: "text/plain" }));
  }

  const res = await expectOk(await fetch(url("/upload"), { method: "POST", headers, body: form }), "上传");
  const json = await res.json();
  const docId: string | undefined = json.items?.[0]?.docId;
  if (!docId) throw new Error("上传未返回 docId");
  return docId;
}

async function pollIngest(docId: string, attempts = 30, intervalMs = 2000) {
  for (let i = 0; i < attempts; i++) {
    const res = await expectOk(
      await fetch(url(`/documents?tenantId=${TENANT_ID}&libraryId=${LIBRARY_ID}`), { headers }),
      "查询文档"
    );
    const json = await res.json();
    const item = (json.items ?? []).find((d: any) => d.docId === docId);
    const status = item?.ingestStatus ?? "uploaded";
    console.log(`轮询第 ${i + 1}/${attempts} 次：状态=${status}`);
    if (status === "indexed") return status;
    if (status === "failed") throw new Error(`入库失败: ${item?.errorMessage ?? "unknown"}`);
    await wait(intervalMs);
  }
  throw new Error("入库超时");
}

async function fetchChunks(docId: string) {
  const res = await expectOk(await fetch(url(`/documents/${docId}/chunks`), { headers }), "获取 chunks");
  const json = await res.json();
  return json.items ?? [];
}

async function fetchStructure(docId: string) {
  const res = await expectOk(await fetch(url(`/documents/${docId}/structure`), { headers }), "获取结构");
  const json = await res.json();
  return json.sections ?? [];
}

async function main() {
  console.log("冒烟开始：", { API_BASE, TENANT_ID, LIBRARY_ID, SMOKE_FILE: SMOKE_FILE ?? "(内嵌文本)" });

  await expectOk(await fetch(url("/health")), "health");
  console.log("✓ health");

  const docId = await upload();
  console.log("✓ 上传完成", docId);

  await pollIngest(docId);
  console.log("✓ 入库完成");

  const chunks = await fetchChunks(docId);
  console.log(`✓ Chunks: ${chunks.length}`);

  const sections = await fetchStructure(docId);
  console.log(`✓ 结构节点: ${sections.length}`);

  console.log("冒烟完成");
}

main().catch((err) => {
  console.error("冒烟失败", err);
  process.exit(1);
});
