import { describe, expect, test } from "vitest";
import { handleRequest } from "../../apps/api/src/routes";
import { HybridRetriever, ChunkRecord } from "../../packages/core/src/retrieval";
import { VectorClient } from "../../packages/core/src/vector";
import { DocumentSchema, ChunkSchema } from "../../packages/shared-schemas/src/index";
import type { QueueAdapter, DocumentRepository } from "@kb/data";
import type { ChunkRepository } from "../../packages/core/src/retrieval";

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

  class MemoryDocumentRepository implements DocumentRepository {
    private readonly docs: Map<string, typeof document>;
    constructor(initial: typeof document[]) {
      this.docs = new Map(initial.map((doc) => [doc.docId, doc]));
    }
    async upsert(doc: typeof document) {
      this.docs.set(doc.docId, doc);
      return doc;
    }
    async list(tenantId?: string) {
      const values = Array.from(this.docs.values());
      if (!tenantId) {
        return values;
      }
      return values.filter((item) => item.tenantId === tenantId);
    }
    async get(docId: string) {
      return this.docs.get(docId) ?? null;
    }
    async updateTags(docId: string, tags: string[]) {
      const doc = this.docs.get(docId);
      if (!doc) return null;
      const updated = { ...doc, tags };
      this.docs.set(docId, updated);
      return updated;
    }
    async delete(docId: string) {
      this.docs.delete(docId);
    }
    async count(tenantId?: string) {
      return (await this.list(tenantId)).length;
    }
    async stats(tenantId?: string) {
      const documents = await this.count(tenantId);
      return { documents, attachments: 0, chunks: 0, pendingJobs: 0 };
    }
  }

  class MemoryChunkRepository implements ChunkRepository {
    constructor(private readonly records: ChunkRecord[]) {}
    async searchCandidates(_request: unknown, _vector: number[]) {
      return this.records;
    }
    async get(chunkId: string) {
      return this.records.find((record) => record.chunk.chunkId === chunkId) ?? null;
    }
  }

  class NoopQueue implements QueueAdapter {
    async enqueue() {}
    async subscribe() {}
  }

  const documents = new MemoryDocumentRepository([document]);
  const chunks = new MemoryChunkRepository([chunkRecord]);
  const retriever = new HybridRetriever({
    vectorClient: new VectorClient({ fallbackDim: 4 }),
    repo: chunks
  });
  const queue = new NoopQueue();

  test("search endpoint returns chunk", async () => {
    const request = new Request("http://test/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "付款", limit: 1 })
    });
    const response = await handleRequest(request, { documents, chunks, queue, retriever });
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.results[0].chunk.chunkId).toBe(chunkRecord.chunk.chunkId);
  });
});
