import { describe, expect, test } from "vitest";
import { handleRequest } from "../../apps/api/src/routes";
import { InMemoryApiRepository } from "../../apps/api/src/repository/in-memory";
import { HybridRetriever, InMemoryChunkRepository } from "../../packages/core/src/retrieval";
import { VectorClient } from "../../packages/core/src/vector";
import { DocumentSchema, ChunkSchema } from "../../packages/shared-schemas/src/index";

describe("API integration (vitest)", () => {
  const document = DocumentSchema.parse({
    docId: crypto.randomUUID(),
    title: "示例合同",
    ingestStatus: "indexed",
    tenantId: "default"
  });

  const chunkRecord = {
    chunk: ChunkSchema.parse({
      chunkId: crypto.randomUUID(),
      docId: document.docId,
      hierPath: ["合同", "付款"],
      contentText: "付款条款示例",
      contentType: "text"
    }),
    document: {
      docId: document.docId,
      title: document.title,
      sourceUri: "kb://doc/1"
    },
    neighbors: [],
    topicLabels: ["付款"]
  };

  const repo = new InMemoryApiRepository([document], [chunkRecord]);
  const retriever = new HybridRetriever({
    vectorClient: new VectorClient({ fallbackDim: 4 }),
    repo: new InMemoryChunkRepository([chunkRecord])
  });

  test("search endpoint returns chunk", async () => {
    const request = new Request("http://test/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "付款", limit: 1 })
    });
    const response = await handleRequest(request, { repo, retriever });
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.results[0].chunk.chunkId).toBe(chunkRecord.chunk.chunkId);
  });
});
