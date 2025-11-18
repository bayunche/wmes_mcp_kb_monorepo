#!/usr/bin/env bun
const API_BASE = process.env.SMOKE_API_BASE ?? "http://localhost:8080";
const API_TOKEN = process.env.SMOKE_API_TOKEN ?? "dev-token";
const TENANT = process.env.SMOKE_TENANT ?? "default";
const LIBRARY = process.env.SMOKE_LIBRARY ?? "default";
const HEADERS: HeadersInit = {
  Authorization: `Bearer ${API_TOKEN}`,
  "Content-Type": "application/json",
  "x-library-id": LIBRARY
};

type SmokeResult = { name: string; status: "ok" | "fail"; info?: string };
const results: SmokeResult[] = [];

async function main() {
  await step("GET /health", async () => {
    const res = await fetch(`${API_BASE}/health`, { headers: HEADERS });
    if (!res.ok) throw new Error(`status ${res.status}`);
  });

  await step("GET /documents", async () => {
    const res = await fetch(`${API_BASE}/documents?tenantId=${TENANT}&libraryId=${LIBRARY}`, { headers: HEADERS });
    if (!res.ok) throw new Error(`status ${res.status}`);
    await res.json();
  });

  const createdId = crypto.randomUUID();
  await step("POST /documents", async () => {
    const payload = {
      docId: createdId,
      title: "Smoke Doc",
      ingestStatus: "uploaded",
      tenantId: TENANT,
      libraryId: LIBRARY
    };
    const res = await fetch(`${API_BASE}/documents`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(await res.text());
  });

  await step("PATCH /documents/:id", async () => {
    const res = await fetch(`${API_BASE}/documents/${createdId}`, {
      method: "PATCH",
      headers: HEADERS,
      body: JSON.stringify({ tags: ["smoke"] })
    });
    if (!res.ok) throw new Error(await res.text());
  });

  await step("POST /documents/:id/reindex", async () => {
    const res = await fetch(`${API_BASE}/documents/${createdId}/reindex`, {
      method: "POST",
      headers: HEADERS
    });
    if (!res.ok) throw new Error(await res.text());
  });

  await step("POST /search", async () => {
    const res = await fetch(`${API_BASE}/search`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ query: "smoke", limit: 1, filters: { libraryId: LIBRARY } })
    });
    if (!res.ok) throw new Error(await res.text());
    await res.json();
  });

  await step("POST /mcp/search", async () => {
    const res = await fetch(`${API_BASE}/mcp/search`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ query: "smoke", limit: 1, filters: { libraryId: LIBRARY } })
    });
    if (!res.ok) throw new Error(await res.text());
  });

  await step("GET /stats", async () => {
    const res = await fetch(`${API_BASE}/stats?tenantId=${TENANT}&libraryId=${LIBRARY}`, { headers: HEADERS });
    if (!res.ok) throw new Error(await res.text());
    await res.json();
  });

  await step("GET /libraries/:id/chunks", async () => {
    const res = await fetch(`${API_BASE}/libraries/${LIBRARY}/chunks`, { headers: HEADERS });
    if (!res.ok) throw new Error(await res.text());
    await res.json();
  });

  await step("GET /metrics", async () => {
    const res = await fetch(`${API_BASE}/metrics`, { headers: HEADERS });
    if (!res.ok) throw new Error(await res.text());
    await res.text();
  });

  await step("DELETE /documents/:id", async () => {
    const res = await fetch(`${API_BASE}/documents/${createdId}`, {
      method: "DELETE",
      headers: HEADERS
    });
    if (!res.ok) throw new Error(await res.text());
  });

  console.table(results);
  const failed = results.filter((item) => item.status === "fail");
  if (failed.length) {
    console.error(`❌ API smoke tests failed: ${failed.map((f) => f.name).join(", ")}`);
    process.exit(1);
  } else {
    console.log("✅ API smoke tests passed");
  }
}

async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, status: "ok" });
  } catch (error) {
    results.push({ name, status: "fail", info: (error as Error).message });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
