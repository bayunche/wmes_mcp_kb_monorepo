import { describe, expect, test, beforeEach } from "bun:test";
import { promises as fs } from "node:fs";
import { handleRequest } from "../routes";
import { HybridRetriever, ChunkRecord } from "../../../../packages/core/src/retrieval";
import { VectorClient } from "../../../../packages/core/src/vector";
import {
  AttachmentSchema,
  ChunkSchema,
  DocumentSchema,
  ModelSettingSecretSchema,
  ModelRole,
  SearchRequestSchema,
  VectorLogSchema,
  type VectorLog
} from "@kb/shared-schemas";
import type {
  AttachmentRepository,
  DocumentRepository,
  ModelSettingsRepository,
  ObjectStorage,
  QueueAdapter,
  RawObjectHandle,
  VectorIndex,
  VectorLogRepository,
  VectorLogInput
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
  async list(tenantId?: string, libraryId?: string) {
    let values = Array.from(this.docs.values());
    if (tenantId) {
      values = values.filter((doc) => doc.tenantId === tenantId);
    }
    if (libraryId) {
      values = values.filter((doc) => doc.libraryId === libraryId);
    }
    return values;
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
  async count(tenantId?: string, libraryId?: string) {
    return (await this.list(tenantId, libraryId)).length;
  }
  async stats(tenantId?: string, libraryId?: string) {
    const documents = await this.count(tenantId, libraryId);
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

  async getRawObject(objectKey: string): Promise<RawObjectHandle> {
    const data = this.raw.get(objectKey) ?? new Uint8Array();
    return { type: "buffer", data, size: data.byteLength };
  }

  async putRawObject(objectKey: string, payload: Buffer | Uint8Array | string) {
    if (typeof payload === "string") {
      const data = await fs.readFile(payload);
      this.raw.set(objectKey, new Uint8Array(data));
      return objectKey;
    }
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
  public readonly jobs: Array<{ docId: string; tenantId: string; libraryId: string }> = [];
  async enqueue(task: { docId: string; tenantId: string; libraryId: string }) {
    this.jobs.push(task);
  }
  async subscribe() {
    // noop
  }
}

class MemoryModelSettingsRepository implements ModelSettingsRepository {
  private readonly data = new Map<string, ReturnType<typeof ModelSettingSecretSchema.parse>>();

  private toKey(tenantId: string, libraryId: string, modelRole: string) {
    return `${tenantId}:${libraryId}:${modelRole}`;
  }

  async get(tenantId: string, libraryId: string, modelRole = "tagging") {
    return this.data.get(this.toKey(tenantId, libraryId, modelRole)) ?? null;
  }

  async list(tenantId: string, libraryId: string) {
    return Array.from(this.data.entries())
      .filter(([key]) => key.startsWith(`${tenantId}:${libraryId}:`))
      .map(([_, value]) => value);
  }

  async upsert(setting: ReturnType<typeof ModelSettingSecretSchema.parse>) {
    const normalized = ModelSettingSecretSchema.parse({
      ...setting,
      updatedAt: new Date().toISOString()
    });
    this.data.set(this.toKey(normalized.tenantId, normalized.libraryId, normalized.modelRole ?? "tagging"), normalized);
    return normalized;
  }

  async delete(tenantId: string, libraryId: string, modelRole: ModelRole = "tagging") {
    this.data.delete(this.toKey(tenantId, libraryId, modelRole));
  }
}

class MemoryVectorLogRepository implements VectorLogRepository {
  private readonly logs: VectorLog[] = [];

  async append(entries: VectorLogInput[]) {
    entries.forEach((entry) => {
      this.logs.push(
        VectorLogSchema.parse({
          logId: entry.logId ?? crypto.randomUUID(),
          chunkId: entry.chunkId,
          docId: entry.docId,
          tenantId: entry.tenantId ?? "default",
          libraryId: entry.libraryId ?? "default",
          modelRole: entry.modelRole,
          provider: entry.provider,
          modelName: entry.modelName,
          driver: entry.driver,
          status: entry.status,
          durationMs: entry.durationMs,
          vectorDim: entry.vectorDim,
          inputChars: entry.inputChars,
          inputTokens: entry.inputTokens,
          outputTokens: entry.outputTokens,
          ocrUsed: entry.ocrUsed,
          metadata: entry.metadata,
          errorMessage: entry.errorMessage,
          createdAt: entry.createdAt ?? new Date().toISOString()
        })
      );
    });
  }

  async list(params: {
    docId?: string;
    chunkId?: string;
    tenantId?: string;
    libraryId?: string;
    limit?: number;
  }) {
    return this.logs
      .filter((log) => {
        if (params.docId && log.docId !== params.docId) return false;
        if (params.chunkId && log.chunkId !== params.chunkId) return false;
        if (params.tenantId && log.tenantId !== params.tenantId) return false;
        if (params.libraryId && log.libraryId !== params.libraryId) return false;
        return true;
      })
      .slice(0, params.limit ?? 100);
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

  async listByLibrary(libraryId: string) {
    return this.records.filter((record) => record.document.libraryId === libraryId);
  }

  async updateTopicLabels(chunkId: string, labels: string[]) {
    const record = this.records.find((item) => item.chunk.chunkId === chunkId);
    if (record) {
      record.chunk.topicLabels = labels;
    }
  }
}

function makeDeps() {
  const document = DocumentSchema.parse({
    docId: crypto.randomUUID(),
    title: "合同示例",
    ingestStatus: "indexed",
    tenantId: "default",
    libraryId: "default",
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
      sourceUri: document.sourceUri,
      tenantId: document.tenantId,
      libraryId: document.libraryId,
      ingestStatus: document.ingestStatus,
      tags: document.tags
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
      sourceUri: document.sourceUri,
      tenantId: document.tenantId,
      libraryId: document.libraryId,
      ingestStatus: document.ingestStatus,
      tags: document.tags
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
  const modelSettings = new MemoryModelSettingsRepository();
  const vectorLogs = new MemoryVectorLogRepository();
  return {
    deps: {
      documents,
      chunks,
      attachments,
      queue,
      retriever,
      storage,
      vectorIndex,
      modelSettings,
      vectorLogs,
      defaultTenantId: "default",
      defaultLibraryId: "default"
    },
    chunkRecord,
    queue,
    attachments,
    storage,
    documents,
    modelSettings,
    vectorLogs
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
    form.append("files", new File([new TextEncoder().encode("hello world")], "demo-a.txt", { type: "text/plain" }));
    form.append("files", new File([new TextEncoder().encode("hello again")], "demo-b.txt", { type: "text/plain" }));
    const request = new Request("http://test/upload", {
      method: "POST",
      headers: authHeader,
      body: form
    });
    const response = await handleRequest(request, setup.deps);
    expect(response.status).toBe(200);
    expect(setup.queue.jobs).toHaveLength(2);
    expect(setup.storage.raw.size).toBe(2);
    const json = await response.json();
    expect(json.items).toHaveLength(2);
  });

  test("model settings can be persisted and fetched", async () => {
    const putRequest = new Request("http://test/model-settings", {
      method: "PUT",
      headers: { ...authHeader, "content-type": "application/json" },
      body: JSON.stringify({
        provider: "openai",
        baseUrl: "https://api.test/v1/chat/completions",
        modelName: "gpt-mini",
        modelRole: "metadata",
        displayName: "元数据模型",
        apiKey: "sk-test1234"
      })
    });
    const putResponse = await handleRequest(putRequest, setup.deps);
    expect(putResponse.status).toBe(200);
    const putJson = await putResponse.json();
    expect(putJson.setting.hasApiKey).toBe(true);
    expect(putJson.setting.modelRole).toBe("metadata");
    expect(putJson.setting.displayName).toBe("元数据模型");
    const getResponse = await handleRequest(new Request("http://test/model-settings?modelRole=metadata", { headers: authHeader }), setup.deps);
    expect(getResponse.status).toBe(200);
    const getJson = await getResponse.json();
    expect(getJson.setting.apiKeyPreview.endsWith("1234")).toBe(true);
    expect(getJson.setting.provider).toBe("openai");
    expect(getJson.setting.modelRole).toBe("metadata");
  });

  test("vector logs endpoint returns filtered records", async () => {
    const docId = setup.chunkRecord.chunk.docId;
    await setup.vectorLogs.append([
      {
        docId,
        chunkId: setup.chunkRecord.chunk.chunkId,
        tenantId: "default",
        libraryId: "default",
        modelRole: "embedding",
        provider: "local",
        modelName: "mock",
        driver: "local",
        status: "success",
        durationMs: 5,
        vectorDim: 4,
        inputChars: 20
      }
    ]);
    const response = await handleRequest(
      new Request(`http://test/vector-logs?docId=${docId}`, { headers: authHeader }),
      setup.deps
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.items).toHaveLength(1);
    expect(json.items[0].docId).toBe(docId);
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
    const statsCalls: Array<{ tenantId?: string; libraryId?: string }> = [];
    setup.deps.documents.stats = async (tenantId?: string, libraryId?: string) => {
      statsCalls.push({ tenantId, libraryId });
      return { documents: 3, attachments: 2, chunks: 5, pendingJobs: 1 };
    };
    const request = new Request("http://test/stats", {
      method: "GET",
      headers: {
        ...authHeader,
        "x-tenant-id": "tenant-b",
        "x-library-id": "kb-1"
      }
    });
    const response = await handleRequest(request, setup.deps);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ documents: 3, attachments: 2, chunks: 5, pendingJobs: 1, tenantId: "tenant-b", libraryId: "kb-1" });
    expect(statsCalls).toEqual([{ tenantId: "tenant-b", libraryId: "kb-1" }]);
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

  test("library chunk listing exposes chunk-level metadata", async () => {
    const request = new Request("http://test/libraries/default/chunks", {
      method: "GET",
      headers: authHeader
    });
    const response = await handleRequest(request, setup.deps);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.libraryId).toBe("default");
    expect(payload.total).toBeGreaterThan(0);
    expect(payload.items[0].chunk.chunkId).toBe(setup.chunkRecord.chunk.chunkId);
    expect(Array.isArray(payload.items[0].attachments)).toBe(true);
  });

  test("document chunk list and chunk update work", async () => {
    const docId = setup.chunkRecord.chunk.docId;
    const chunkId = setup.chunkRecord.chunk.chunkId;

    const listRes = await handleRequest(
      new Request(`http://test/documents/${docId}/chunks`, {
        method: "GET",
        headers: authHeader
      }),
      setup.deps
    );
    expect(listRes.status).toBe(200);
    const listJson = await listRes.json();
    expect(listJson.items).toHaveLength(2);

    const patchRes = await handleRequest(
      new Request(`http://test/chunks/${chunkId}`, {
        method: "PATCH",
        headers: authHeader,
        body: JSON.stringify({ topicLabels: ["新标签"] })
      }),
      setup.deps
    );
    expect(patchRes.status).toBe(200);
    const updated = await patchRes.json();
    expect(updated.chunk.topicLabels).toContain("新标签");
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
