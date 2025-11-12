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

export interface CommandOptions {
  dryRun: boolean;
  cwd?: string;
  env?: Record<string, string>;
  ignoreError?: boolean;
}

export async function runCommand(command: string, args: string[], options: CommandOptions) {
  logStep(`Executing ${command}`, { args, cwd: options.cwd, dryRun: options.dryRun });
  if (options.dryRun) {
    return { exitCode: 0, skipped: true };
  }

  const proc = Bun.spawn({
    cmd: [command, ...args],
    stdout: "inherit",
    stderr: "inherit",
    cwd: options.cwd,
    env: { ...process.env, ...options.env }
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0 && !options.ignoreError) {
    throw new Error(`${command} exited with code ${exitCode}`);
  }
  return { exitCode };
}
