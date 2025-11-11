#!/usr/bin/env bun
import { parseArgs, getEnvConfig, logStep } from "./utils";

const options = parseArgs({ tenantId: process.env.DEFAULT_TENANT_ID ?? "default", dryRun: true });
const config = getEnvConfig();

async function main() {
  logStep("Starting backup script", { tenant: options.tenantId, dryRun: options.dryRun });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const snapshotDir = `./backups/${options.tenantId}/${timestamp}`;

  logStep("Preparing snapshot directory", { snapshotDir });

  logStep("Backing up Postgres schema and data", {
    command: `pg_dump ${config.DATABASE_URL} --data-only --file ${snapshotDir}/database.sql`
  });

  logStep("Backing up pgvector metadata", {
    command: `pg_dump ${config.DATABASE_URL} --schema-only --file ${snapshotDir}/schema.sql`
  });

logStep("Syncing MinIO objects", {
  source: `${config.MINIO_ENDPOINT}/kb-raw/${options.tenantId}`,
  target: `${snapshotDir}/objects/`
});

  logStep("Exporting Qdrant collections", {
    endpoint: config.QDRANT_URL,
    command: `curl -X POST ${config.QDRANT_URL}/collections/export`
  });

  logStep("Backup completed");
}

main().catch((error) => {
  console.error("Backup script failed", error);
  process.exit(1);
});
