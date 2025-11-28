import { describe, expect, test } from "bun:test";
import { processIngestionTask, resolveDependencies } from "../pipeline";
import { WorkerDependencies } from "../types";
import { KnowledgeBundle, IngestionTask } from "@kb/shared-schemas";
import { loadConfig } from "../../../../packages/core/src/config";
import type { QueueAdapter, ObjectStorage } from "@kb/data";
import { VectorClient } from "../../../../packages/core/src/vector";
import { AdaptiveChunkFactory } from "../../../../packages/core/src/parsing";

class StubQueue implements QueueAdapter {
  async enqueue(): Promise<void> {
    // no-op
  }
  async subscribe(): Promise<void> {
    // no-op
  }
}

class StubStorage implements ObjectStorage {
  async getRawObject(): Promise<Uint8Array> {
    return new Uint8Array();
  }
  async putRawObject(objectKey: string): Promise<string> {
    return objectKey;
  }
  async putPreviewObject(objectKey: string): Promise<string> {
    return objectKey;
  }
  async deleteRawObject(): Promise<void> {
    // no-op
  }
  async deletePreviewObject(): Promise<void> {
    // no-op
  }
  async deletePreviewPrefix(): Promise<void> {
    // no-op
  }
}

const stubSemanticSegmenter = async ({
  document,
  text
}: {
  document: { title?: string };
  text: string;
}) => [
  {
    id: crypto.randomUUID(),
    title: document.title ?? "section",
    content: text,
    level: 1,
    path: [document.title ?? "section"]
  }
];

const chunkFactory = new AdaptiveChunkFactory({ maxChars: 500, overlapChars: 50 });

const stubEmbedChunks: WorkerDependencies["embedChunks"] = async (_doc, chunks) => {
  return {
    entries: chunks.map((chunk) => ({
      chunk,
      embedding: {
        embId: crypto.randomUUID(),
        chunkId: chunk.chunkId,
        modality: "text",
        modelName: "test-embed",
        vector: [0.1, 0.2, 0.3, 0.4],
        dim: 4,
        createdAt: new Date().toISOString()
      }
    }))
  };
};

describe("Ingestion worker pipeline", () => {
  test("processes tasks and persists bundle", async () => {
    const persisted: KnowledgeBundle[] = [];
    const config = loadConfig({ envFile: ".env.example" });
    const queue = new StubQueue();
    const storage = new StubStorage();
    const vectorClient = new VectorClient({ fallbackDim: 4 });

    const deps: WorkerDependencies = resolveDependencies({
      config,
      queue,
      knowledgeWriter: {
        persistBundle: async (bundle) => {
          persisted.push(bundle);
        }
      },
      embedChunks: stubEmbedChunks,
      chunkFactory,
      chunkDocument: async (doc, elements, source) => {
        const fragments = chunkFactory.createChunks(doc, elements);
        source.semanticSections = [];
        return fragments;
      },
      semanticSegmenter: stubSemanticSegmenter,
      storage,
      vectorClient,
      fetchSource: async () => ({
        rawText: "第一段\n\n第二段",
        metadata: { title: "合同示例" },
        tenantId: "tenant-test"
      }),
      logger: {}
    });

    await processIngestionTask(
      {
        jobId: crypto.randomUUID(),
        docId: crypto.randomUUID(),
        tenantId: "tenant-test",
        libraryId: "lib-test"
      },
      deps
    );

    expect(persisted).toHaveLength(1);
    expect(persisted[0].chunks).toHaveLength(2);
    expect(persisted[0].embeddings?.length).toBe(2);
    expect(persisted[0].document.tags?.length).toBeGreaterThan(0);
  });

  test("fills local semantic metadata when metadata model is missing", async () => {
    const persisted: KnowledgeBundle[] = [];
    const config = loadConfig({ envFile: ".env.example" });
    const queue = new StubQueue();
    const storage = new StubStorage();
    const vectorClient = new VectorClient({ fallbackDim: 4 });

    const deps: WorkerDependencies = resolveDependencies({
      config,
      queue,
      knowledgeWriter: {
        persistBundle: async (bundle) => {
          persisted.push(bundle);
        }
      },
      embedChunks: stubEmbedChunks,
      chunkFactory,
      chunkDocument: async (doc, elements, source) => {
        const fragments = chunkFactory.createChunks(doc, elements);
        source.semanticSections = [];
        return fragments;
      },
      semanticSegmenter: stubSemanticSegmenter,
      storage,
      vectorClient,
      fetchSource: async () => ({
        rawText: "本段用于元数据生成的内容，包含产品名称和发布时间。",
        metadata: { title: "元数据空值回退测试" },
        tenantId: "tenant-test",
        libraryId: "lib-test"
      }),
      logger: {}
    });

    await processIngestionTask(
      {
        jobId: crypto.randomUUID(),
        docId: crypto.randomUUID(),
        tenantId: "tenant-test",
        libraryId: "lib-test"
      },
      deps
    );

    expect(persisted).toHaveLength(1);
    const chunk = persisted[0].chunks[0];
    expect(chunk.semanticMetadata?.contextSummary).toBeTruthy();
    expect(chunk.semanticMetadata?.semanticTags?.length ?? 0).toBeGreaterThan(0);
    expect(chunk.semanticTitle ?? chunk.sectionTitle).toBeTruthy();
  });

  test("merges remote tags when model settings are available", async () => {
    const persisted: KnowledgeBundle[] = [];
    const config = loadConfig({ envFile: ".env.example" });
    const queue = new StubQueue();
    const storage = new StubStorage();
    const vectorClient = new VectorClient({ fallbackDim: 4 });
    const fetchResponse = {
      response: JSON.stringify({ tags: ["远程标签", "金融"] })
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(fetchResponse), {
        status: 200,
        headers: { "content-type": "application/json" }
      })) as typeof fetch;

    const deps: WorkerDependencies = resolveDependencies({
      config,
      queue,
      knowledgeWriter: {
        persistBundle: async (bundle) => {
          persisted.push(bundle);
        }
      },
      embedChunks: stubEmbedChunks,
      chunkFactory,
      chunkDocument: async (doc, elements, source) => {
        const fragments = chunkFactory.createChunks(doc, elements);
        source.semanticSections = [];
        return fragments;
      },
      semanticSegmenter: stubSemanticSegmenter,
      storage,
      vectorClient,
      fetchSource: async () => ({
        rawText: "第一段\n\n第二段",
        metadata: { title: "合同示例" },
        tenantId: "tenant-test",
        libraryId: "lib-test"
      }),
      modelSettings: {
        async get(_tenantId?: string, _libraryId?: string, role?: string) {
          if (role === "tagging") {
            return {
              tenantId: "tenant-test",
              libraryId: "lib-test",
              provider: "ollama",
              baseUrl: "https://mock.example/v1",
              modelName: "mock-model",
              apiKey: "fake-key"
            };
          }
          return null;
        },
        async upsert() {
          throw new Error("not implemented");
        }
      },
      logger: {}
    });

    try {
      await processIngestionTask(
        {
          jobId: crypto.randomUUID(),
          docId: crypto.randomUUID(),
          tenantId: "tenant-test",
          libraryId: "lib-test"
        },
        deps
      );

      expect(persisted[0].document.tags).toEqual(
        expect.arrayContaining(["远程标签", "金融"])
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
