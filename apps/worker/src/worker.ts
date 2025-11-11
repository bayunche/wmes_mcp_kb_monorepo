import { loadConfig } from "../../../packages/core/src/config";
import { IngestionTask } from "@kb/shared-schemas";
import { InMemoryQueue } from "./queue/in-memory-queue";
import { handleQueueMessage, resolveDependencies } from "./pipeline";
import { QueueClient, WorkerDependencies } from "./types";
import { MetricsRegistry } from "../../../packages/tooling/src/metrics";

export interface StartWorkerOptions extends Partial<WorkerDependencies> {
  queue?: QueueClient;
  metrics?: MetricsRegistry;
}

export async function startWorker(options: StartWorkerOptions = {}): Promise<QueueClient> {
  const config = options.config ?? loadConfig();
  const queue = options.queue ?? new InMemoryQueue();
  const deps = resolveDependencies({
    ...options,
    config,
    queue,
    logger: options.logger ?? console,
    metrics: options.metrics
  });

  await queue.subscribe(async (task: IngestionTask) => {
    await handleQueueMessage(task, deps);
  });

  deps.logger.info?.("Worker subscription ready.");
  return queue;
}
