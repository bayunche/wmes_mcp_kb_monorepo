import { describe, expect, test, beforeEach } from "bun:test";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
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
  VectorLogInput,
  TenantConfigRepository,
  LibraryConfigRepository
} from "@kb/data";
import type { ChunkRepository } from "@kb/core/src/retrieval";

const authHeader = { Authorization: "Bearer dev-token" };

class MemoryDocumentRepository implements DocumentRepository {
  private readonly docs = new Map<string, ReturnType<typeof DocumentSchema.parse>>();
  private readonly sections = new Map<string, any[]>();

  constructor(initial: ReturnType<typeof DocumentSchema.parse>[] = [], sections?: Record<string, any[]>) {
    initial.forEach((doc) => this.docs.set(doc.docId, doc));
    if (sections) {
      Object.entries(sections).forEach(([docId, list]) => this.sections.set(docId, list));
    }
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

  async updateStatus(docId: string, status: string, errorMessage?: string) {
    const doc = this.docs.get(docId);
    if (!doc) return null;
    const next = { ...doc, ingestStatus: status, errorMessage };
    this.docs.set(docId, next);
    return next;
  }

  async listSections(docId: string) {
    return this.sections.get(docId) ?? [];
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

class FailingModelSettingsRepository implements ModelSettingsRepository {
  constructor(private readonly error: Error) {}

  async get(): Promise<ReturnType<typeof ModelSettingSecretSchema.parse> | null> {
    return null;
  }

  async list(): Promise<ReturnType<typeof ModelSettingSecretSchema.parse>[]> {
    return [];
  }

  async upsert(): Promise<ReturnType<typeof ModelSettingSecretSchema.parse>> {
    throw this.error;
  }

  async delete(): Promise<void> {
    return;
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

class MemoryTenantConfigRepository implements TenantConfigRepository {
  private readonly data = new Map<string, { tenantId: string; displayName?: string }>();
  async list() {
    return Array.from(this.data.values());
  }
  async upsert(payload: { tenantId: string; displayName?: string }) {
    this.data.set(payload.tenantId, payload);
    return payload;
  }
  async delete(tenantId: string) {
    this.data.delete(tenantId);
  }
}

class MemoryLibraryConfigRepository implements LibraryConfigRepository {
  private readonly data = new Map<string, { libraryId: string; displayName?: string; tenantId?: string }>();
  async list() {
    return Array.from(this.data.values());
  }
  async upsert(payload: { libraryId: string; displayName?: string; tenantId?: string }) {
    this.data.set(payload.libraryId, payload);
    return payload;
  }
  async delete(libraryId: string) {
    this.data.delete(libraryId);
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
    title: "Contract Sample",
    ingestStatus: "indexed",
    tenantId: "default",
    libraryId: "default",
    sourceUri: "default/source.bin"
  });

  const chunkRecord: ChunkRecord = {
    chunk: ChunkSchema.parse({
      chunkId: crypto.randomUUID(),
      docId: document.docId,
      hierPath: ["contract", "payment"],
      contentText: "Payment terms are described here",
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
    topicLabels: ["payment"],
    createdAt: new Date().toISOString()
  };

  const neighborRecord: ChunkRecord = {
    chunk: ChunkSchema.parse({
      chunkId: crypto.randomUUID(),
      docId: document.docId,
      hierPath: ["contract", "delivery"],
      contentText: "Delivery details are here",
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
    topicLabels: ["delivery"],
    createdAt: new Date().toISOString()
  };

  const documents = new MemoryDocumentRepository(
    [document],
    {
      [document.docId]: [
        { sectionId: "sec-1", title: "�½�һ", level: 1, tags: ["tag-1"], keywords: ["kw"] }
      ]
    }
  );
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
  const tenantConfigs = new MemoryTenantConfigRepository();
  const libraryConfigs = new MemoryLibraryConfigRepository();
  const modelsDir = tmpdir();
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
      tenantConfigs,
      libraryConfigs,
      modelsDir,
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

  test("health route responds ok", async () => {
    const request = new Request("http://test/health", { method: "GET" });
    const response = await handleRequest(request, setup.deps);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.ok).toBe(true);
  });

  test("search route returns attachments and sourceUri", async () => {
    const request = new Request("http://test/search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeader
      },
      body: JSON.stringify(SearchRequestSchema.parse({ query: "����", limit: 1, filters: { hasAttachments: true } }))
    });
    const response = await handleRequest(request, setup.deps);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.results[0].attachments).toHaveLength(1);
    expect(json.results[0].sourceUri).toBe(`kb://chunk/${setup.chunkRecord.chunk.chunkId}`);
  });

  test("upload route stores object and enqueues ingestion", async () => {
    const form = new FormData();
    form.append("title", "�ϴ���ͬ");
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
        displayName: "Metadata Model",
        apiKey: "sk-test1234"
      })
    });
    const putResponse = await handleRequest(putRequest, setup.deps);
    expect(putResponse.status).toBe(200);
    const putJson = await putResponse.json();
    expect(putJson.setting.hasApiKey).toBe(true);
    expect(putJson.setting.modelRole).toBe("metadata");
    expect(putJson.setting.displayName).toBe("Metadata Model");
    const getResponse = await handleRequest(new Request("http://test/model-settings?modelRole=metadata", { headers: authHeader }), setup.deps);
    expect(getResponse.status).toBe(200);
    const getJson = await getResponse.json();
    expect(getJson.setting.apiKeyPreview.endsWith("1234")).toBe(true);
    expect(getJson.setting.provider).toBe("openai");
    expect(getJson.setting.modelRole).toBe("metadata");
  });

  test("model settings constraint violation returns hint to run migrations", async () => {
    const constraintError = new Error(
      'new row for relation "model_settings" violates check constraint "model_settings_provider_check"'
    );
    (constraintError as any).code = "23514";
    (constraintError as any).constraint = "model_settings_provider_check";
    const deps = {
      ...setup.deps,
      modelSettings: new FailingModelSettingsRepository(constraintError)
    };
    const request = new Request("http://test/model-settings", {
      method: "PUT",
      headers: { ...authHeader, "content-type": "application/json" },
      body: JSON.stringify({
        provider: "local",
        baseUrl: "http://localhost:11434",
        modelName: "nomic-embed-text",
        modelRole: "embedding"
      })
    });
    const response = await handleRequest(request, deps);
    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).toContain("model_settings.provider 约束未更新");
    expect(text).toContain("运行数据库迁移");
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
      title: "��������ͬ",
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
        body: JSON.stringify({ topicLabels: ["new-tag"] })
      }),
      setup.deps
    );
    expect(patchRes.status).toBe(200);
    const updated = await patchRes.json();
    expect(updated.chunk.topicLabels).toContain("new-tag");
  });

  test("/mcp/search returns MCP enriched payload", async () => {
    const request = new Request("http://test/mcp/search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeader
      },
      body: JSON.stringify({ query: "����", limit: 2 })
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

  test("documents POST creates doc and enqueues ingestion", async () => {
    const docId = crypto.randomUUID();
    const payload = {
      docId,
      title: "新文档",
      tenantId: "tenant-x",
      libraryId: "lib-x"
    };
    const request = new Request("http://test/documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const response = await handleRequest(request, setup.deps);
    expect(response.status).toBe(201);
    expect(setup.queue.jobs.some((job) => job.docId === docId)).toBe(true);
  });

  test("document structure returns sections", async () => {
    const request = new Request(`http://test/documents/${setup.chunkRecord.chunk.docId}/structure`, {
      method: "GET"
    });
    const response = await handleRequest(request, setup.deps);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.sections.length).toBeGreaterThan(0);
  });

  test("tenant config list/upsert/delete works", async () => {
    const put = await handleRequest(
      new Request("http://test/config/tenants", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: "tenant-a", displayName: "Tenant A" })
      }),
      setup.deps
    );
    expect(put.status).toBe(200);
    const list = await handleRequest(new Request("http://test/config/tenants"), setup.deps);
    const listJson = await list.json();
    expect(listJson.items.some((t: any) => t.tenantId === "tenant-a")).toBe(true);
    const del = await handleRequest(new Request("http://test/config/tenants/tenant-a", { method: "DELETE" }), setup.deps);
    expect(del.status).toBe(204);
  });

  test("library config list/upsert/delete works", async () => {
    const put = await handleRequest(
      new Request("http://test/config/libraries", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ libraryId: "lib-a", displayName: "Library A" })
      }),
      setup.deps
    );
    expect(put.status).toBe(200);
    const list = await handleRequest(new Request("http://test/config/libraries"), setup.deps);
    const listJson = await list.json();
    expect(listJson.items.some((item: any) => item.libraryId === "lib-a")).toBe(true);
    const del = await handleRequest(new Request("http://test/config/libraries/lib-a", { method: "DELETE" }), setup.deps);
    expect(del.status).toBe(204);
  });

  test("/models returns directory info", async () => {
    const response = await handleRequest(new Request("http://test/models"), setup.deps);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.dir).toBe(setup.deps.modelsDir);
    expect(json.items).toBeDefined();
  });

  test("/model-settings/catalog returns catalog", async () => {
    const response = await handleRequest(new Request("http://test/model-settings/catalog"), setup.deps);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(Array.isArray(json.items)).toBe(true);
  });
});



