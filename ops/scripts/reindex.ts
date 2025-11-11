#!/usr/bin/env bun
import { parseArgs, getEnvConfig, logStep } from "./utils";
import { startWorker } from "../../apps/worker/src/worker";

const options = parseArgs({ tenantId: process.env.DEFAULT_TENANT_ID ?? "default", dryRun: true });
const config = getEnvConfig();

async function main() {
  logStep("Starting reindex script", { tenant: options.tenantId, dryRun: options.dryRun });

  const worker = await startWorker({
    config,
    queue: {
      enqueue: async () => undefined,
      subscribe: async () => undefined
    } as any,
    metrics: undefined
  });

  logStep("Enqueueing reindex task", {
    queue: config.RABBITMQ_URL,
    payload: { type: "reindex", tenantId: options.tenantId }
  });

  await worker.enqueue({
    jobId: crypto.randomUUID(),
    docId: crypto.randomUUID(),
    tenantId: options.tenantId
  });

  logStep("Reindex script finished (placeholder)");
}

main().catch((error) => {
  console.error("Reindex script failed", error);
  process.exit(1);
});
