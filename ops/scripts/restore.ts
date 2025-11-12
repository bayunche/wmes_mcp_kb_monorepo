#!/usr/bin/env bun
import { join } from "node:path";
import { parseArgs, getEnvConfig, logStep, runCommand } from "./utils";

const options = parseArgs({ tenantId: process.env.DEFAULT_TENANT_ID ?? "default", dryRun: true });
const config = getEnvConfig();

async function main() {
  const snapshotDir = process.env.SNAPSHOT_DIR ?? join("backups", options.tenantId, "latest");
  logStep("Starting restore script", { tenant: options.tenantId, dryRun: options.dryRun, snapshotDir });

  await runCommand(
    "psql",
    [config.DATABASE_URL, "-f", join(snapshotDir, "schema.sql")],
    { dryRun: options.dryRun }
  );

  await runCommand(
    "psql",
    [config.DATABASE_URL, "-f", join(snapshotDir, "database.sql")],
    { dryRun: options.dryRun }
  );

  const alias = `kb-${options.tenantId}-restore`;
  await runCommand(
    "mc",
    ["alias", "set", alias, config.MINIO_ENDPOINT, config.MINIO_ACCESS_KEY, config.MINIO_SECRET_KEY],
    { dryRun: options.dryRun, ignoreError: true }
  );

  await runCommand(
    "mc",
    ["mirror", join(snapshotDir, "objects"), `${alias}/kb-raw/${options.tenantId}`],
    { dryRun: options.dryRun }
  );

  await runCommand(
    "curl",
    ["-f", "-X", "POST", `${config.QDRANT_URL}/collections/import`],
    { dryRun: options.dryRun }
  );

  const payload = {
    jobId: crypto.randomUUID(),
    docId: crypto.randomUUID(),
    tenantId: options.tenantId
  };

  await publishRabbit(payload);

  logStep("Restore script finished");
}

async function publishRabbit(payload: Record<string, unknown>) {
  const amqpUrl = new URL(config.RABBITMQ_URL);
  const user = process.env.RABBITMQ_HTTP_USER ?? decodeURIComponent(amqpUrl.username || "guest");
  const pass = process.env.RABBITMQ_HTTP_PASS ?? decodeURIComponent(amqpUrl.password || "guest");
  const httpBase = process.env.RABBITMQ_HTTP_URL ?? `http://${amqpUrl.hostname}:15672`;
  const routingKey = process.env.RABBITMQ_QUEUE ?? "kb.ingestion";
  const body = JSON.stringify({
    properties: {},
    routing_key: routingKey,
    payload: JSON.stringify(payload),
    payload_encoding: "string"
  });

  await runCommand(
    "curl",
    [
      "-f",
      "-u",
      `${user}:${pass}`,
      "-H",
      "content-type:application/json",
      "-X",
      "POST",
      `${httpBase}/api/exchanges/%2f/amq.default/publish`,
      "-d",
      body
    ],
    { dryRun: options.dryRun }
  );

  logStep("Published reindex job", { routingKey, payload });
}

main().catch((error) => {
  console.error("Restore script failed", error);
  process.exit(1);
});
