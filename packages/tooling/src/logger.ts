import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = process.env.LOG_DIR ?? "logs";
const ENV_FLAG = process.env.LOG_ENV ?? process.env.NODE_ENV ?? "development";
const FOLDER = ENV_FLAG === "production" || ENV_FLAG === "prod" ? "prod" : "dev";
const MAX_BYTES = Number(process.env.LOG_MAX_BYTES ?? 1024 * 1024);

function logPath(service: string) {
  return join(ROOT, FOLDER, `${service}.log`);
}

function ensureWritable(path: string) {
  mkdirSync(dirname(path), { recursive: true });
}

function rotateIfNeeded(path: string) {
  try {
    const stats = statSync(path);
    if (stats.size >= MAX_BYTES) {
      const rotated = `${path.replace(/\.log$/, "")}-${Date.now()}.log`;
      renameSync(path, rotated);
    }
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

function writeLine(path: string, line: string) {
  ensureWritable(path);
  rotateIfNeeded(path);
  appendFileSync(path, line, "utf8");
}

function format(level: string, message: string) {
  return `[${new Date().toISOString()}] ${level.padEnd(5)} ${message}\n`;
}

type RequestLike = { method: string; url: string };
export type ServiceLogger = ReturnType<typeof createLogger>;

export function createLogger(service: string) {
  const path = logPath(service);
  return {
    info(message: string) {
      writeLine(path, format("INFO", message));
    },
    error(message: string, error?: unknown) {
      const detail = error instanceof Error ? `${message} -> ${error.message}\n${error.stack ?? ""}` : `${message}${error ? ` -> ${String(error)}` : ""}`;
      writeLine(path, format("ERROR", detail));
    },
    request(request: RequestLike, status: number, durationMs: number) {
      writeLine(path, format("INFO", `${request.method} ${request.url} -> ${status} (${durationMs}ms)`));
    }
  };
}
