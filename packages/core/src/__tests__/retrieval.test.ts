import { describe, expect, test } from "bun:test";
import { HybridRetriever, InMemoryChunkRepository, ChunkRecord } from "../retrieval";
import { VectorClient } from "../vector";
import { ChunkSchema } from "@kb/shared-schemas";

const chunk = (overrides: Partial<ChunkRecord>): ChunkRecord => ({
  chunk: ChunkSchema.parse({
    chunkId: crypto.randomUUID(),
    docId: overrides.document?.docId ?? crypto.randomUUID(),
    hierPath: ["章节", overrides.chunk?.hierPath?.[1] ?? "段落"],
    contentText: overrides.chunk?.contentText ?? "默认内容",
    contentType: "text"
  }),
  document: overrides.document ?? {
    docId: crypto.randomUUID(),
    title: "示例文档",
    sourceUri: "kb://doc/1"
  },
  topicLabels: overrides.topicLabels,
  neighbors: overrides.neighbors,
  createdAt: overrides.createdAt ?? new Date().toISOString()
});

describe("HybridRetriever", () => {
  test("ranks chunks by similarity and keyword match", async () => {
    const repo = new InMemoryChunkRepository([
      chunk({ chunk: { contentText: "付款条款在此段落" } }),
      chunk({ chunk: { contentText: "本段落涉及交付与验收" } })
    ]);

    const retriever = new HybridRetriever({
      vectorClient: new VectorClient({ fallbackDim: 4 }),
      repo
    });

    const response = await retriever.search({ query: "付款条款", limit: 2 });
    expect(response.total).toBe(2);
    expect(response.results[0].chunk.contentText).toContain("付款");
  });

  test("can return neighbors when requested", async () => {
    const neighborChunk = ChunkSchema.parse({
      chunkId: crypto.randomUUID(),
      docId: crypto.randomUUID(),
      hierPath: ["章", "邻居"],
      contentType: "text",
      contentText: "邻居内容"
    });

    const repo = new InMemoryChunkRepository([
      chunk({
        chunk: { contentText: "包含图像描述" },
        neighbors: [neighborChunk]
      })
    ]);

    const retriever = new HybridRetriever({
      vectorClient: new VectorClient(),
      repo
    });

    const response = await retriever.search({
      query: "图像",
      includeNeighbors: true
    });

    expect(response.results[0].neighbors).toHaveLength(1);
  });
});
