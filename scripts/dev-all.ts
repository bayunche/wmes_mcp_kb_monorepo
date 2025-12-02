#!/usr/bin/env bun
const ENV_FILE = process.env.ENV_FILE ?? ".env";
const API_TOKEN = process.env.API_TOKEN ?? "dev-token";
// 默认走同源 /api，由本地 Vite 代理转发到宿主机 API；可通过环境覆盖
const VITE_API_BASE = process.env.VITE_API_BASE ?? "/api";
const VITE_API_TOKEN = process.env.VITE_API_TOKEN ?? API_TOKEN;
const VITE_PREVIEW_BASE = process.env.VITE_PREVIEW_BASE ?? "http://localhost:9000/kb-preview";

type ProcSpec = {
  name: string;
  cmd: string[];
  env?: Record<string, string>;
  cwd?: string;
};

const specs: ProcSpec[] = [
  {
    name: "worker",
    cmd: ["bun", "run", "apps/worker/src/main.ts"],
    env: { START_WORKER: "true", ENV_FILE }
  },
  {
    name: "api",
    cmd: ["bun", "run", "apps/api/src/main.ts"],
    env: { START_API_SERVER: "true", ENV_FILE, API_TOKEN }
  },
  {
    name: "mcp",
    cmd: ["bun", "run", "apps/mcp/src/main.ts"],
    env: { START_MCP_SERVER: "true", ENV_FILE }
  },
  {
    name: "web",
    cwd: "apps/web",
    cmd: ["bunx", "vite", "dev", "--host"],
    env: {
      VITE_API_BASE,
      VITE_API_TOKEN,
      VITE_PREVIEW_BASE,
      VITE_PROXY_TARGET: process.env.VITE_PROXY_TARGET ?? "http://192.168.0.57:8080"
    }
  }
];

const processes = specs.map((spec) => {
  console.log(`[dev] starting ${spec.name} → ${spec.cmd.join(" ")}`);
  const proc = Bun.spawn({
    cmd: spec.cmd,
    cwd: spec.cwd,
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env, ...spec.env }
  });
  return { spec, proc };
});

let stopping = false;
const stopAll = (code = 0) => {
  if (stopping) return;
  stopping = true;
  for (const { proc, spec } of processes) {
    try {
      if (!proc.killed) {
        console.log(`[dev] stopping ${spec.name}`);
        proc.kill();
      }
    } catch {
      /* ignore */
    }
  }
  process.exit(code);
};

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

await Promise.all(
  processes.map(async ({ proc, spec }) => {
    const code = await proc.exited;
    console.log(`[dev] ${spec.name} exited with code ${code}`);
    if (!stopping) {
      if (code !== 0) {
        console.error(`[dev] ${spec.name} failed; stopping remaining processes.`);
        stopAll(code);
      } else {
        stopAll(0);
      }
    }
  })
);
