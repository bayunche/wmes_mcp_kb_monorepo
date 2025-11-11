#!/usr/bin/env bun
import { spawnSync } from "bun";

function parseArgs() {
  const args = new Map<string, string>();
  for (let i = 2; i < Bun.argv.length; i += 1) {
    const [key, value] = Bun.argv[i].split("=");
    args.set(key.replace(/^--/, ""), value ?? "true");
  }
  return {
    version: args.get("version"),
    registry: args.get("registry") ?? "kb-local"
  };
}

const options = parseArgs();
if (!options.version) {
  console.error("Usage: bun run scripts/rollback-stack.ts --version=2025-11-10 [--registry=kb-local]");
  process.exit(1);
}

console.log(`Preparing rollback to ${options.registry}/kb-api:${options.version} (and related images).`);

const composeDown = spawnSync(["docker", "compose", "down"], { stdout: "inherit", stderr: "inherit" });
if (composeDown.exitCode !== 0) {
  console.warn("docker compose down failed, continuing...");
}

const services = ["kb-api", "kb-worker", "kb-mcp"];
for (const service of services) {
  const image = `${options.registry}/${service}:${options.version}`;
  console.log(`Pulling ${image}`);
  const pull = spawnSync(["docker", "pull", image], { stdout: "inherit", stderr: "inherit" });
  if (pull.exitCode !== 0) {
    console.error(`Failed to pull ${image}`);
  }
}

console.log("Restarting stack with rollback version...");
const composeUp = spawnSync(["docker", "compose", "up", "-d"], { stdout: "inherit", stderr: "inherit" });
if (composeUp.exitCode !== 0) {
  console.error("docker compose up failed");
  process.exit(composeUp.exitCode ?? 1);
}

console.log("Rollback completed.");
