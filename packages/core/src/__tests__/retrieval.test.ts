import { describe, expect, test } from "bun:test";
import { HybridRetriever, InMemoryChunkRepository, ChunkRecord } from "../retrieval";
import { VectorClient } from "../vector";
import { ChunkSchema } from "@kb/shared-schemas";

const chunk = (overrides: Partial<ChunkRecord>): ChunkRecord => ({
  chunk: ChunkSchema.parse({
    chunkId: crypto.randomUUID(),
    docId: overrides.document?.docId ?? crypto.randomUUID(),
    hierPath: ["绔犺妭", overrides.chunk?.hierPath?.[1] ?? "娈佃惤"],
    contentText: overrides.chunk?.contentText ?? "榛樿鍐呭",
    contentType: "text"
  }),
  document: overrides.document ?? {
    docId: crypto.randomUUID(),
    title: "绀轰緥鏂囨。",
    sourceUri: "kb://doc/1"
  },
  topicLabels: overrides.topicLabels,
  neighbors: overrides.neighbors,
  createdAt: overrides.createdAt ?? new Date().toISOString()
});

describe("HybridRetriever", () => {
  test("ranks chunks by similarity and keyword match", async () => {
    const repo = new InMemoryChunkRepository([
      chunk({ chunk: { contentText: "浠樻鏉℃鍦ㄦ娈佃惤" } }),
      chunk({ chunk: { contentText: "鏈钀芥秹鍙婁氦浠樹笌楠屾敹" } })
    ]);

    const retriever = new HybridRetriever({
      vectorClient: new VectorClient({ fallbackDim: 4 }),
      repo
    });

    const response = await retriever.search({ query: "浠樻鏉℃", limit: 2 });
    expect(response.total).toBe(2);
    expect(
      response.results.some((item) => item.chunk.contentText?.includes("浠樻"))
    ).toBeTruthy();
  });

  test("can return neighbors when requested", async () => {
    const neighborChunk = ChunkSchema.parse({
      chunkId: crypto.randomUUID(),
      docId: crypto.randomUUID(),
      hierPath: ["绔犺妭", "閭诲眳"],
      contentType: "text",
      contentText: "閭诲眳鍐呭"
    });

    const repo = new InMemoryChunkRepository([
      chunk({
        chunk: { contentText: "鍖呭惈鍥惧儚鎻忚堪" },
        neighbors: [neighborChunk]
      })
    ]);

    const retriever = new HybridRetriever({
      vectorClient: new VectorClient(),
      repo
    });

    const response = await retriever.search({
      query: "鍥惧儚",
      includeNeighbors: true
    });

    expect(response.results[0].neighbors).toHaveLength(1);
  });
});
