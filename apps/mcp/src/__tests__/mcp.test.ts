import { describe, expect, test } from "bun:test";
import { createMcpServer, handleMcpRequest } from "../index";
import { ChunkSchema, SearchRequestSchema } from "@kb/shared-schemas";
import { ChunkRecord } from "../../../../packages/core/src/retrieval";
import { VectorClient } from "../../../../packages/core/src/vector";

const makeChunkRecord = (content: string): ChunkRecord => ({
  chunk: ChunkSchema.parse({
    chunkId: crypto.randomUUID(),
    docId: crypto.randomUUID(),
    hierPath: ["合同", "付款"],
    contentText: content,
    contentType: "text"
  }),
  document: {
    docId: crypto.randomUUID(),
    title: "合同",
    sourceUri: "kb://doc/1"
  },
  neighbors: [],
  topicLabels: ["付款"],
  createdAt: new Date().toISOString()
});

describe("MCP server tools", () => {
  const data = [makeChunkRecord("付款条款一"), makeChunkRecord("交付说明")];
  const server = createMcpServer({ data, vectorClient: new VectorClient({ fallbackDim: 4 }) });
  const context = { requestId: crypto.randomUUID(), tenantId: "default" };

  test("kb.search returns ranked chunks", async () => {
    const request = SearchRequestSchema.parse({ query: "付款", limit: 2 });
    const response = await handleMcpRequest(server, "kb.search", request, context);
    expect((response as { results: { chunk: { contentText?: string } }[] }).results[0].chunk.contentText).toContain(
      "付款"
    );
  });

  test("kb.related returns neighbors", async () => {
    const chunkId = data[0].chunk.chunkId;
    const response = await handleMcpRequest(server, "kb.related", { chunkId }, context);
    expect((response as { source: { chunkId: string } }).source.chunkId).toBe(chunkId);
  });

  test("kb.preview returns chunk snapshot", async () => {
    const chunkId = data[1].chunk.chunkId;
    const response = await handleMcpRequest(server, "kb.preview", { chunkId }, context);
    expect((response as { chunk: { contentText?: string } }).chunk.contentText).toContain("交付");
  });
});
