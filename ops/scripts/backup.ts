#!/usr/bin/env bun
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseArgs, getEnvConfig, logStep, runCommand } from "./utils";

const options = parseArgs({ tenantId: process.env.DEFAULT_TENANT_ID ?? "default", dryRun: true });
const config = getEnvConfig();

async function main() {
  logStep("Starting backup script", { tenant: options.tenantId, dryRun: options.dryRun });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const snapshotDir = join("backups", options.tenantId, timestamp);
  mkdirSync(join(snapshotDir, "objects"), { recursive: true });

  const dbFile = join(snapshotDir, "database.sql");
  const schemaFile = join(snapshotDir, "schema.sql");
  logStep("Preparing snapshot directory", { snapshotDir });

  await runCommand(
    "pg_dump",
    [config.DATABASE_URL, "--data-only", "--file", dbFile],
    { dryRun: options.dryRun }
  );

  await runCommand(
    "pg_dump",
    [config.DATABASE_URL, "--schema-only", "--file", schemaFile],
    { dryRun: options.dryRun }
  );

  const alias = `kb-${options.tenantId}`;
  await runCommand(
    "mc",
    ["alias", "set", alias, config.MINIO_ENDPOINT, config.MINIO_ACCESS_KEY, config.MINIO_SECRET_KEY],
    { dryRun: options.dryRun, ignoreError: true }
  );

  await runCommand(
    "mc",
    ["mirror", `${alias}/kb-raw/${options.tenantId}`, join(snapshotDir, "objects")],
    { dryRun: options.dryRun }
  );

  const qdrantSnapshot = join(snapshotDir, "qdrant-export.json");
  await runCommand(
    "curl",
    ["-f", "-X", "POST", "-o", qdrantSnapshot, `${config.QDRANT_URL}/collections/export`],
    { dryRun: options.dryRun }
  );

  logStep("Backup completed", { snapshotDir });
}

main().catch((error) => {
  console.error("Backup script failed", error);
  process.exit(1);
});
