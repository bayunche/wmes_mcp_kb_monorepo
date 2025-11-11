import { describe, expect, test } from "bun:test";
import { startWorker } from "../worker";
import { InMemoryQueue } from "../queue/in-memory-queue";
import { WorkerDependencies } from "../types";
import { KnowledgeBundle } from "@kb/shared-schemas";
import { loadConfig } from "../../../../packages/core/src/config";

describe("Ingestion worker pipeline", () => {
  test("processes tasks and persists bundle", async () => {
    const queue = new InMemoryQueue();
    const persisted: KnowledgeBundle[] = [];

    const config = loadConfig({ envFile: ".env.example" });

    const overrides: Partial<WorkerDependencies> = {
      config,
      queue,
      fetchSource: async () => ({
        rawText: "第 1 段\n\n第 2 段",
        metadata: { title: "合同示例" }
      }),
      persistBundle: async (bundle) => {
        persisted.push(bundle);
      },
      logger: {}
    };

    await startWorker(overrides);

    await queue.enqueue({
      jobId: crypto.randomUUID(),
      docId: crypto.randomUUID(),
      tenantId: "tenant-test"
    });

    expect(persisted).toHaveLength(1);
    expect(persisted[0].chunks).toHaveLength(2);
  });
});
