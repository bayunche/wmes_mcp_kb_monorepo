#!/usr/bin/env bun
import { spawnSync } from "bun";

type PublishOptions = {
  registry: string;
  version: string;
  push: boolean;
};

function parseOptions(): PublishOptions {
  const args = new Map<string, string>();
  for (let i = 2; i < Bun.argv.length; i += 1) {
    const [key, value] = Bun.argv[i].split("=");
    args.set(key.replace(/^--/, ""), value ?? "true");
  }
  return {
    registry: args.get("registry") ?? "kb-local",
    version: args.get("version") ?? new Date().toISOString().split("T")[0],
    push: args.get("push") === "true"
  };
}

const options = parseOptions();
const services = [
  { name: "api", path: "apps/api", image: "kb-api" },
  { name: "worker", path: "apps/worker", image: "kb-worker" },
  { name: "mcp", path: "apps/mcp", image: "kb-mcp" }
];

for (const service of services) {
  const tag = `${options.registry}/${service.image}:${options.version}`;
  console.log(`\n=== Building ${service.name} image (${tag}) ===`);
  const buildArgs = ["docker", "buildx", "build", service.path, "-t", tag];
  if (options.push) {
    buildArgs.push("--push");
  } else {
    buildArgs.push("--load");
  }
  const build = spawnSync(buildArgs, { stdout: "inherit", stderr: "inherit" });
  if (build.exitCode !== 0) {
    console.error(`Failed to build ${service.name} image`);
    process.exit(build.exitCode ?? 1);
  }
}

console.log("\nPublish script finished.");
console.log(`Registry: ${options.registry}, version: ${options.version}, push: ${options.push}`);
