#!/usr/bin/env bun
import { parseArgs, getEnvConfig, logStep } from "./utils";

const options = parseArgs({ tenantId: process.env.DEFAULT_TENANT_ID ?? "default", dryRun: true });
const config = getEnvConfig();

async function main() {
  const snapshotDir = process.env.SNAPSHOT_DIR ?? `./backups/${options.tenantId}/latest`;
  logStep("Starting restore script", { tenant: options.tenantId, dryRun: options.dryRun, snapshotDir });

  logStep("Restoring Postgres schema", {
    command: `psql ${config.DATABASE_URL} -f ${snapshotDir}/schema.sql`
  });

  logStep("Restoring Postgres data", {
    command: `psql ${config.DATABASE_URL} -f ${snapshotDir}/database.sql`
  });

  logStep("Restoring MinIO objects", {
    command: `mc mirror ${snapshotDir}/objects ${config.MINIO_ENDPOINT}/kb-raw/${options.tenantId}`
  });

  logStep("Importing Qdrant collections", {
    endpoint: config.QDRANT_URL,
    command: `curl -X POST ${config.QDRANT_URL}/collections/import`
  });

  logStep("Triggering reindex queue message", {
    queue: config.RABBITMQ_URL,
    payload: { type: "reindex", tenantId: options.tenantId }
  });

  logStep("Restore script finished");
}

main().catch((error) => {
  console.error("Restore script failed", error);
  process.exit(1);
});
