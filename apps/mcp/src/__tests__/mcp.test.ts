import { describe, expect, test } from "bun:test";
import { createMcpServer, handleMcpRequest } from "../index";
import { AttachmentSchema, ChunkSchema, SearchRequestSchema } from "@kb/shared-schemas";
import { ChunkRecord, InMemoryChunkRepository } from "../../../../packages/core/src/retrieval";
import { VectorClient } from "../../../../packages/core/src/vector";
import type { AttachmentRepository } from "@kb/data";

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

class MemoryAttachmentRepository implements AttachmentRepository {
  constructor(private readonly attachments: ReturnType<typeof AttachmentSchema.parse>[]) {}
  async listByChunkIds(chunkIds: string[]) {
    return this.attachments.filter((item) => item.chunkId && chunkIds.includes(item.chunkId));
  }
  async listByDocument(docId: string) {
    return this.attachments.filter((item) => item.docId === docId);
  }
  async deleteByDocId() {
    // noop for MCP tests
  }
  async count() {
    return this.attachments.length;
  }
}

describe("MCP server tools", () => {
  const data = [makeChunkRecord("付款条款一"), makeChunkRecord("交付说明")];
  const attachments = [
    AttachmentSchema.parse({
      assetId: crypto.randomUUID(),
      docId: data[0].document.docId,
      chunkId: data[0].chunk.chunkId,
      assetType: "image",
      objectKey: "kb/default/doc/preview.png",
      mimeType: "image/png"
    })
  ];
  const server = createMcpServer({
    chunkRepository: new InMemoryChunkRepository(data),
    attachments: new MemoryAttachmentRepository(attachments),
    vectorClient: new VectorClient({ fallbackDim: 4 })
  });
  const context = { requestId: crypto.randomUUID(), tenantId: "default" };

  test("kb.search returns attachments and sourceUri", async () => {
    const request = SearchRequestSchema.parse({ query: "付款", limit: 2 });
    const response = (await handleMcpRequest(server, "kb.search", request, context)) as {
      results: Array<{ attachments: unknown[]; sourceUri: string }>;
    };
    expect(response.results[0].attachments.length).toBeGreaterThan(0);
    expect(response.results[0].sourceUri).toMatch(/^kb:\/\/chunk/);
  });

  test("kb.related returns neighbors with attachments", async () => {
    const chunkId = data[0].chunk.chunkId;
    const response = (await handleMcpRequest(server, "kb.related", { chunkId }, context)) as {
      source: { attachments: unknown[] };
    };
    expect(response.source.attachments.length).toBeGreaterThan(0);
  });

  test("kb.preview returns chunk snapshot with attachments", async () => {
    const chunkId = data[0].chunk.chunkId;
    const response = (await handleMcpRequest(server, "kb.preview", { chunkId }, context)) as {
      attachments: unknown[];
    };
    expect(response.attachments.length).toBeGreaterThan(0);
  });
});
