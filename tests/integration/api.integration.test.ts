import { describe, expect, test } from "vitest";
import { handleRequest } from "../../apps/api/src/routes";
import { HybridRetriever, ChunkRecord } from "../../packages/core/src/retrieval";
import { VectorClient } from "../../packages/core/src/vector";
import { AttachmentSchema, ChunkSchema, DocumentSchema } from "@kb/shared-schemas";
import type {
  AttachmentRepository,
  DocumentRepository,
  ObjectStorage,
  QueueAdapter
} from "@kb/data";
import type { ChunkRepository } from "../../packages/core/src/retrieval";

describe("API integration (vitest)", () => {
  const document = DocumentSchema.parse({
    docId: crypto.randomUUID(),
    title: "示例合同",
    ingestStatus: "indexed",
    tenantId: "default",
    libraryId: "default"
  });

  const chunkRecord: ChunkRecord = {
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
      sourceUri: "kb://doc/1",
      tenantId: document.tenantId,
      libraryId: document.libraryId,
      ingestStatus: document.ingestStatus,
      tags: document.tags
    },
    neighbors: [],
    topicLabels: ["付款"]
  };

  class MemoryDocumentRepository implements DocumentRepository {
    private readonly docs = new Map<string, ReturnType<typeof DocumentSchema.parse>>();
    constructor(initial: ReturnType<typeof DocumentSchema.parse>[] = []) {
      initial.forEach((doc) => this.docs.set(doc.docId, doc));
    }
    async upsert(doc: ReturnType<typeof DocumentSchema.parse>) {
      this.docs.set(doc.docId, doc);
      return doc;
    }
    async list(tenantId?: string, libraryId?: string) {
      let values = Array.from(this.docs.values());
      if (tenantId) {
        values = values.filter((item) => item.tenantId === tenantId);
      }
      if (libraryId) {
        values = values.filter((item) => item.libraryId === libraryId);
      }
      return values;
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
    async updateStatus(docId: string, status: string) {
      const doc = this.docs.get(docId);
      if (!doc) return;
      this.docs.set(docId, { ...doc, ingestStatus: status });
    }
    async delete(docId: string) {
      this.docs.delete(docId);
    }
    async count(tenantId?: string, libraryId?: string) {
      return (await this.list(tenantId, libraryId)).length;
    }
    async stats(tenantId?: string, libraryId?: string) {
      const documents = await this.count(tenantId, libraryId);
      return { documents, attachments: 0, chunks: 0, pendingJobs: 0 };
    }
  }

  class MemoryChunkRepository implements ChunkRepository {
    constructor(private readonly records: ChunkRecord[]) {}
    async searchCandidates() {
      return this.records;
    }
    async get(chunkId: string) {
      return this.records.find((record) => record.chunk.chunkId === chunkId) ?? null;
    }
    async listByDocument(docId: string) {
      return this.records.filter((record) => record.chunk.docId === docId);
    }
  }

  class MemoryAttachmentRepository implements AttachmentRepository {
    private readonly items = new Map<string, ReturnType<typeof AttachmentSchema.parse>>();
    constructor(initial: ReturnType<typeof AttachmentSchema.parse>[] = []) {
      initial.forEach((item) => this.items.set(item.assetId, item));
    }
    async listByChunkIds(chunkIds: string[]) {
      return Array.from(this.items.values()).filter(
        (item) => item.chunkId && chunkIds.includes(item.chunkId)
      );
    }
    async listByDocument(docId: string) {
      return Array.from(this.items.values()).filter((item) => item.docId === docId);
    }
    async deleteByDocId(docId: string) {
      for (const [key, value] of this.items.entries()) {
        if (value.docId === docId) this.items.delete(key);
      }
    }
    async count() {
      return this.items.size;
    }
  }

  class MemoryQueue implements QueueAdapter {
    public readonly jobs: Array<{ docId: string; tenantId: string; libraryId: string }> = [];
    async enqueue(task: { docId: string; tenantId: string; libraryId: string }) {
      this.jobs.push(task);
    }
    async subscribe() {}
  }

  class MemoryStorage implements ObjectStorage {
    async getRawObject() {
      return new Uint8Array();
    }
    async putRawObject(objectKey: string) {
      return objectKey;
    }
    async putPreviewObject(objectKey: string) {
      return objectKey;
    }
    async deleteRawObject() {}
    async deletePreviewObject() {}
    async deletePreviewPrefix() {}
  }

  const chunks = new MemoryChunkRepository([chunkRecord]);
  const retriever = new HybridRetriever({
    vectorClient: new VectorClient({ fallbackDim: 4 }),
    repo: chunks
  });

  const createDeps = () => ({
    documents: new MemoryDocumentRepository([document]),
    attachments: new MemoryAttachmentRepository([
      AttachmentSchema.parse({
        assetId: crypto.randomUUID(),
        docId: document.docId,
        chunkId: chunkRecord.chunk.chunkId,
        assetType: "image",
        objectKey: "demo/object.png",
        mimeType: "image/png"
      })
    ]),
    chunks,
    queue: new MemoryQueue(),
    retriever,
    storage: new MemoryStorage(),
    defaultTenantId: "default",
    defaultLibraryId: "default"
  });

  test("search endpoint returns chunk", async () => {
    const deps = createDeps();
    const request = new Request("http://test/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "付款", limit: 1 })
    });
    const response = await handleRequest(request, deps);
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.results[0].chunk.chunkId).toBe(chunkRecord.chunk.chunkId);
  });

  test("documents lifecycle endpoints", async () => {
    const deps = createDeps();
    const newDoc = DocumentSchema.parse({
      docId: crypto.randomUUID(),
      title: "新的合同",
      ingestStatus: "uploaded",
      tenantId: "default"
    });

    const createRes = await handleRequest(
      new Request("http://test/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(newDoc)
      }),
      deps
    );
    expect(createRes.status).toBe(201);

    const listRes = await handleRequest(new Request("http://test/documents?tenantId=default"), deps);
    const listJson = await listRes.json();
    expect(listJson.items.length).toBeGreaterThanOrEqual(2);

    const patchRes = await handleRequest(
      new Request(`http://test/documents/${newDoc.docId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tags: ["重要"] })
      }),
      deps
    );
    const patched = await patchRes.json();
    expect(patched.tags).toContain("重要");

    const reindexRes = await handleRequest(
      new Request(`http://test/documents/${newDoc.docId}/reindex`, { method: "POST" }),
      deps
    );
    expect(reindexRes.status).toBe(200);
    expect(deps.queue.jobs.at(-1)?.docId).toBe(newDoc.docId);

    const deleteRes = await handleRequest(
      new Request(`http://test/documents/${newDoc.docId}`, { method: "DELETE" }),
      deps
    );
    expect(deleteRes.status).toBe(204);

    const statsRes = await handleRequest(new Request("http://test/stats"), deps);
    const statsJson = await statsRes.json();
    expect(statsJson.documents).toBeGreaterThanOrEqual(1);
  });
});
