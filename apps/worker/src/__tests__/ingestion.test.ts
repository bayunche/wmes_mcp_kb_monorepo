import { describe, expect, test } from "bun:test";
import { processIngestionTask, resolveDependencies } from "../pipeline";
import { WorkerDependencies } from "../types";
import { KnowledgeBundle, IngestionTask } from "@kb/shared-schemas";
import { loadConfig } from "../../../../packages/core/src/config";
import type { QueueAdapter, ObjectStorage } from "@kb/data";
import { VectorClient } from "../../../../packages/core/src/vector";

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
        tenantId: "tenant-test"
      },
      deps
    );

    expect(persisted).toHaveLength(1);
    expect(persisted[0].chunks).toHaveLength(2);
    expect(persisted[0].embeddings?.length).toBe(2);
  });
});
