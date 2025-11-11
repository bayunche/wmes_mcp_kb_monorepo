import { startWorker } from "./worker";

async function bootstrap() {
  const queue = await startWorker();

  if (process.env.SEED_DEMO_TASK === "true") {
    await queue.enqueue({
      jobId: crypto.randomUUID(),
      docId: crypto.randomUUID(),
      tenantId: "default"
    });
  }
}

if (import.meta.main && process.env.START_WORKER === "true") {
  bootstrap().catch((error) => {
    console.error("Failed to bootstrap worker", error);
    process.exit(1);
  });
}
