import { describe, expect, test } from "bun:test";
import { startApiServer } from "../server";
import { InMemoryApiRepository } from "../repository/in-memory";
import { HybridRetriever, InMemoryChunkRepository, ChunkRecord } from "../../../../packages/core/src/retrieval";
import { VectorClient } from "../../../../packages/core/src/vector";
import { DocumentSchema, ChunkSchema, SearchRequestSchema } from "@kb/shared-schemas";
import { handleRequest } from "../routes";
import { requireAuth } from "../auth";

const authHeader = { Authorization: "Bearer test-token" };

function makeRepo() {
  const document = DocumentSchema.parse({
    docId: crypto.randomUUID(),
    title: "合同示例",
    ingestStatus: "indexed",
    tenantId: "default"
  });

  const chunkRecord: ChunkRecord = {
    chunk: ChunkSchema.parse({
      chunkId: crypto.randomUUID(),
      docId: document.docId,
      hierPath: ["合同", "付款"],
      contentText: "付款条款在这里",
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

  return { repo, retriever, chunkRecord };
}

describe("API server", () => {
  test("requireAuth rejects invalid token", () => {
    expect(() => requireAuth(new Request("http://test/documents"), "secret")).toThrow();
  });

  test("handleRequest returns search results", async () => {
    const { repo, retriever, chunkRecord } = makeRepo();
    const request = new Request("http://test/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(SearchRequestSchema.parse({ query: "付款", limit: 1 }))
    });
    const response = await handleRequest(request, { repo, retriever });
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.results[0].chunk.chunkId).toBe(chunkRecord.chunk.chunkId);
  });

});
