#!/usr/bin/env bun
import { spawnSync } from "bun";
import fs from "node:fs";

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
  { name: "api", dockerfile: "deploy/docker/Dockerfile.api", image: "kb-api" },
  { name: "worker", dockerfile: "deploy/docker/Dockerfile.worker", image: "kb-worker" },
  { name: "mcp", dockerfile: "deploy/docker/Dockerfile.mcp", image: "kb-mcp" }
];

function assertMigrationsPresent() {
  // 构建前确保关键迁移文件在上下文中，避免镜像缺失导致线上缺表/约束
  const required = ["0010_model_settings_provider_local.sql"];
  for (const file of required) {
    const full = `db/migrations/${file}`;
    if (!fs.existsSync(full)) {
      throw new Error(`缺少迁移文件：${full}，请先同步到工作区或重新拉取代码`);
    }
  }
}

assertMigrationsPresent();

for (const service of services) {
  const tag = `${options.registry}/${service.image}:${options.version}`;
  console.log(`\n=== Building ${service.name} image (${tag}) ===`);
  const buildArgs = [
    "docker",
    "buildx",
    "build",
    ".",
    "-f",
    service.dockerfile,
    "-t",
    tag
  ];
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
