#!/usr/bin/env bun
import { parseArgs, getEnvConfig, logStep, runCommand } from "./utils";

const options = parseArgs({ tenantId: process.env.DEFAULT_TENANT_ID ?? "default", dryRun: true });
const config = getEnvConfig();

async function main() {
  logStep("Starting reindex script", { tenant: options.tenantId, dryRun: options.dryRun });

  const payload = {
    jobId: crypto.randomUUID(),
    docId: crypto.randomUUID(),
    tenantId: options.tenantId
  };

  await publishRabbit(payload);

  logStep("Reindex script finished");
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

  logStep("Enqueued ingestion task via RabbitMQ HTTP API", { routingKey, payload });
}

main().catch((error) => {
  console.error("Reindex script failed", error);
  process.exit(1);
});
