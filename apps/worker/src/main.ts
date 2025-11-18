import { startWorker } from "./worker";
import { createLogger } from "@kb/tooling";

async function bootstrap() {
  const logger = createLogger("worker");
  const queue = await startWorker({ logger });
  logger.info("Worker subscription ready");

  if (process.env.SEED_DEMO_TASK === "true") {
    await queue.enqueue({
      jobId: crypto.randomUUID(),
      docId: crypto.randomUUID(),
      tenantId: "default",
      libraryId: process.env.DEFAULT_LIBRARY_ID ?? "default"
    });
    logger.info("Seeded demo ingestion task");
  }
}

if (import.meta.main && process.env.START_WORKER === "true") {
  bootstrap().catch((error) => {
    console.error("Failed to bootstrap worker", error);
    process.exit(1);
  });
}
