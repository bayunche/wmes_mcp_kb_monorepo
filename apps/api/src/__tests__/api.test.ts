import { describe, expect, test, beforeEach } from "bun:test";
import { handleRequest } from "../routes";
import { HybridRetriever, ChunkRecord } from "../../../../packages/core/src/retrieval";
import { VectorClient } from "../../../../packages/core/src/vector";
import {
  AttachmentSchema,
  ChunkSchema,
  DocumentSchema,
  SearchRequestSchema
} from "@kb/shared-schemas";
import type {
  AttachmentRepository,
  DocumentRepository,
  ObjectStorage,
  QueueAdapter,
  VectorIndex
} from "@kb/data";
import type { ChunkRepository } from "@kb/core/src/retrieval";

const authHeader = { Authorization: "Bearer dev-token" };

class MemoryDocumentRepository implements DocumentRepository {
  private readonly docs = new Map<string, ReturnType<typeof DocumentSchema.parse>>();

  constructor(initial: ReturnType<typeof DocumentSchema.parse>[] = []) {
    initial.forEach((doc) => this.docs.set(doc.docId, doc));
  }

  async upsert(document: ReturnType<typeof DocumentSchema.parse>) {
    this.docs.set(document.docId, document);
    return document;
  }
  async list(tenantId?: string) {
    const values = Array.from(this.docs.values());
    if (!tenantId) {
      return values;
    }
    return values.filter((doc) => doc.tenantId === tenantId);
  }
  async get(docId: string) {
    return this.docs.get(docId) ?? null;
  }
  async updateTags(docId: string, tags: string[]) {
    const doc = this.docs.get(docId);
    if (!doc) return null;
    const next = { ...doc, tags };
    this.docs.set(docId, next);
    return next;
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

class MemoryAttachmentRepository implements AttachmentRepository {
  private readonly data = new Map<string, ReturnType<typeof AttachmentSchema.parse>>();

  constructor(initial: ReturnType<typeof AttachmentSchema.parse>[] = []) {
    initial.forEach((item) => this.data.set(item.assetId, item));
  }

  async listByChunkIds(chunkIds: string[]) {
    return Array.from(this.data.values()).filter(
      (attachment) => attachment.chunkId && chunkIds.includes(attachment.chunkId)
    );
  }

  async listByDocument(docId: string) {
    return Array.from(this.data.values()).filter((attachment) => attachment.docId === docId);
  }

  async deleteByDocId(docId: string) {
    for (const [key, value] of this.data.entries()) {
      if (value.docId === docId) {
        this.data.delete(key);
      }
    }
  }

  async count() {
    return this.data.size;
  }
}

class MemoryStorage implements ObjectStorage {
  readonly raw = new Map<string, Uint8Array>();
  readonly preview = new Map<string, Uint8Array>();
  readonly deletedPrefixes: string[] = [];

  async getRawObject(objectKey: string): Promise<Uint8Array> {
    return this.raw.get(objectKey) ?? new Uint8Array();
  }

  async putRawObject(objectKey: string, payload: Buffer | Uint8Array) {
    this.raw.set(objectKey, payload instanceof Uint8Array ? payload : new Uint8Array(payload));
    return objectKey;
  }

  async putPreviewObject(objectKey: string, payload: Buffer | Uint8Array) {
    this.preview.set(objectKey, payload instanceof Uint8Array ? payload : new Uint8Array(payload));
    return objectKey;
  }

  async deleteRawObject(objectKey: string) {
    this.raw.delete(objectKey);
  }

  async deletePreviewObject(objectKey: string) {
    this.preview.delete(objectKey);
  }

  async deletePreviewPrefix(prefix: string) {
    this.deletedPrefixes.push(prefix);
    for (const key of Array.from(this.preview.keys())) {
      if (key.startsWith(prefix)) {
        this.preview.delete(key);
      }
    }
  }
}

class MemoryQueue implements QueueAdapter {
  public readonly jobs: Array<{ docId: string; tenantId: string }> = [];
  async enqueue(task: { docId: string; tenantId: string }) {
    this.jobs.push(task);
  }
  async subscribe() {
    // noop
  }
}

class NoopVectorIndex implements VectorIndex {
  async upsert() {}
  async search() {
    return [];
  }
  async deleteByChunkIds() {}
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

function makeDeps() {
  const document = DocumentSchema.parse({
    docId: crypto.randomUUID(),
    title: "合同示例",
    ingestStatus: "indexed",
    tenantId: "default",
    sourceUri: "default/source.bin"
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
      sourceUri: document.sourceUri
    },
    neighbors: [],
    topicLabels: ["付款"],
    createdAt: new Date().toISOString()
  };

  const neighborRecord: ChunkRecord = {
    chunk: ChunkSchema.parse({
      chunkId: crypto.randomUUID(),
      docId: document.docId,
      hierPath: ["合同", "交付"],
      contentText: "交付条款在这里",
      contentType: "text"
    }),
    document: {
      docId: document.docId,
      title: document.title,
      sourceUri: document.sourceUri
    },
    neighbors: [],
    topicLabels: ["交付"],
    createdAt: new Date().toISOString()
  };

  const documents = new MemoryDocumentRepository([document]);
  const attachments = new MemoryAttachmentRepository([
    AttachmentSchema.parse({
      assetId: crypto.randomUUID(),
      docId: document.docId,
      chunkId: chunkRecord.chunk.chunkId,
      assetType: "image",
      objectKey: `default/${document.docId}/preview.png`,
      mimeType: "image/png"
    })
  ]);
  const chunks = new MemoryChunkRepository([chunkRecord, neighborRecord]);
  const retriever = new HybridRetriever({
    vectorClient: new VectorClient({ fallbackDim: 4 }),
    repo: chunks
  });
  const queue = new MemoryQueue();
  const storage = new MemoryStorage();
  const vectorIndex = new NoopVectorIndex();
  return {
    deps: {
      documents,
      chunks,
      attachments,
      queue,
      retriever,
      storage,
      vectorIndex,
      defaultTenantId: "default"
    },
    chunkRecord,
    queue,
    attachments,
    storage,
    documents
  };
}

describe("API routes", () => {
  let setup: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    setup = makeDeps();
  });

  test("search route returns attachments and sourceUri", async () => {
    const request = new Request("http://test/search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeader
      },
      body: JSON.stringify(SearchRequestSchema.parse({ query: "付款", limit: 1, filters: { hasAttachments: true } }))
    });
    const response = await handleRequest(request, setup.deps);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.results[0].attachments).toHaveLength(1);
    expect(json.results[0].sourceUri).toBe(`kb://chunk/${setup.chunkRecord.chunk.chunkId}`);
  });

  test("upload route stores object and enqueues ingestion", async () => {
    const form = new FormData();
    form.append("title", "上传合同");
    form.append("tenantId", "default");
    form.append("file", new File([new TextEncoder().encode("hello world")], "demo.txt", { type: "text/plain" }));
    const request = new Request("http://test/upload", {
      method: "POST",
      headers: authHeader,
      body: form
    });
    const response = await handleRequest(request, setup.deps);
    expect(response.status).toBe(201);
    expect(setup.queue.jobs).toHaveLength(1);
    expect(setup.storage.raw.size).toBe(1);
  });

  test("documents route respects X-Tenant-Id when listing", async () => {
    const otherDoc = DocumentSchema.parse({
      docId: crypto.randomUUID(),
      title: "其他租戶合同",
      ingestStatus: "indexed",
      tenantId: "tenant-b",
      sourceUri: "tenant-b/source.bin"
    });
    await setup.documents.upsert(otherDoc);
    const request = new Request("http://test/documents", {
      method: "GET",
      headers: {
        ...authHeader,
        "x-tenant-id": "tenant-b"
      }
    });
    const response = await handleRequest(request, setup.deps);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.items).toHaveLength(1);
    expect(json.items[0].docId).toBe(otherDoc.docId);
  });

  test("stats route returns tenant scoped counters", async () => {
    const statsCalls: Array<string | undefined> = [];
    setup.deps.documents.stats = async (tenantId?: string) => {
      statsCalls.push(tenantId);
      return { documents: 3, attachments: 2, chunks: 5, pendingJobs: 1 };
    };
    const request = new Request("http://test/stats", {
      method: "GET",
      headers: {
        ...authHeader,
        "x-tenant-id": "tenant-b"
      }
    });
    const response = await handleRequest(request, setup.deps);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ documents: 3, attachments: 2, chunks: 5, pendingJobs: 1 });
    expect(statsCalls).toEqual(["tenant-b"]);
  });

  test("delete route clears raw and preview objects under doc prefix", async () => {
    const docId = setup.chunkRecord.chunk.docId;
    const prefix = `default/${docId}/`;
    setup.storage.raw.set(`default/${docId}/source.pdf`, new Uint8Array([1]));
    setup.storage.preview.set(`${prefix}tables/table-1.json`, new Uint8Array([1]));
    const request = new Request(`http://test/documents/${docId}`, {
      method: "DELETE",
      headers: {
        ...authHeader,
        "x-tenant-id": "default"
      }
    });
    const response = await handleRequest(request, setup.deps);
    expect(response.status).toBe(204);
    expect(setup.storage.deletedPrefixes).toContain(prefix);
    expect(setup.storage.preview.has(`${prefix}tables/table-1.json`)).toBe(false);
    expect(await setup.attachments.listByDocument(docId)).toHaveLength(0);
  });

  test("reindex route forbids mismatched tenant headers", async () => {
    const docId = setup.chunkRecord.chunk.docId;
    const request = new Request(`http://test/documents/${docId}/reindex`, {
      method: "POST",
      headers: {
        ...authHeader,
        "x-tenant-id": "tenant-b"
      }
    });
    const response = await handleRequest(request, setup.deps);
    expect(response.status).toBe(403);
    expect(setup.queue.jobs).toHaveLength(0);
  });

  test("/mcp/search returns MCP enriched payload", async () => {
    const request = new Request("http://test/mcp/search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeader
      },
      body: JSON.stringify({ query: "付款", limit: 2 })
    });
    const response = await handleRequest(request, setup.deps);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.results[0].attachments).toHaveLength(1);
    expect(json.results[0].sourceUri).toMatch(/^kb:\/\/chunk/);
  });

  test("/mcp/related returns neighbors", async () => {
    const request = new Request("http://test/mcp/related", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeader
      },
      body: JSON.stringify({ chunkId: setup.chunkRecord.chunk.chunkId, limit: 5 })
    });
    const response = await handleRequest(request, setup.deps);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.source.attachments).toHaveLength(1);
    expect(json.neighbors.length).toBeGreaterThan(0);
  });

  test("/mcp/preview returns chunk snapshot", async () => {
    const request = new Request("http://test/mcp/preview", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeader
      },
      body: JSON.stringify({ chunkId: setup.chunkRecord.chunk.chunkId })
    });
    const response = await handleRequest(request, setup.deps);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.chunk.chunkId).toBe(setup.chunkRecord.chunk.chunkId);
    expect(json.attachments).toHaveLength(1);
  });
});
