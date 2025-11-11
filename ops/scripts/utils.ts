import { loadConfig } from "../../packages/core/src/config";

export function getEnvConfig() {
  return loadConfig({ envFile: process.env.ENV_FILE ?? ".env" });
}

export interface ScriptOptions {
  tenantId: string;
  dryRun: boolean;
}

export function parseArgs(defaults: ScriptOptions): ScriptOptions {
  const args = new Map<string, string>();
  for (let i = 2; i < Bun.argv.length; i += 1) {
    const [key, value] = Bun.argv[i].split("=");
    args.set(key.replace(/^--/, ""), value ?? "true");
  }
  return {
    tenantId: args.get("tenantId") ?? defaults.tenantId,
    dryRun: args.get("execute") === "true" ? false : defaults.dryRun
  };
}

export function logStep(message: string, details?: Record<string, unknown>) {
  console.log(`[${new Date().toISOString()}] ${message}`);
  if (details) {
    console.log(JSON.stringify(details, null, 2));
  }
}
