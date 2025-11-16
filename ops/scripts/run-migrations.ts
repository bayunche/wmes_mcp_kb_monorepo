import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { loadConfig } from "../../packages/core/src/config";

type PsqlInvoker = {
  command: string;
  args: string[];
  label: string;
};

function parseCommand(raw: string): PsqlInvoker | null {
  const segments = raw
    .split(/\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (!segments.length) {
    return null;
  }
  const [command, ...args] = segments;
  return { command, args, label: raw };
}

function detectHostPsql(): PsqlInvoker | null {
  try {
    execFileSync("psql", ["--version"], { stdio: "ignore" });
    return { command: "psql", args: [], label: "psql" };
  } catch {
    return null;
  }
}

function resolvePsqlInvoker(): PsqlInvoker {
  const custom = process.env.PSQL_COMMAND;
  if (custom) {
    const parsed = parseCommand(custom);
    if (!parsed) {
      throw new Error("PSQL_COMMAND is defined but empty. Provide a valid command, e.g. 'docker compose exec -T kb-db psql'.");
    }
    return parsed;
  }

  const hostPsql = detectHostPsql();
  if (hostPsql) {
    return hostPsql;
  }

  const service = process.env.PSQL_DOCKER_SERVICE ?? "db";
  console.warn(
    `psql not available in PATH, falling back to 'docker compose exec -T ${service} psql'. ` +
      "Override via PSQL_COMMAND or install the PostgreSQL client if preferred."
  );
  return parseCommand(`docker compose exec -T ${service} psql`)!;
}

function getMigrationFiles() {
  const migrationsDir = resolve(process.cwd(), "db/migrations");
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => resolve(migrationsDir, file));
}

function runMigration(invoker: PsqlInvoker, databaseUrl: string, file: string) {
  console.log(`Applying ${file} via ${invoker.label}`);
  const sql = readFileSync(file);
  execFileSync(
    invoker.command,
    [
      ...invoker.args,
      databaseUrl,
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      "-"
    ],
    {
      stdio: ["pipe", "inherit", "inherit"],
      input: sql
    }
  );
}

async function main() {
  const cfg = loadConfig({ envFile: process.env.ENV_FILE ?? ".env" });
  const psqlInvoker = resolvePsqlInvoker();
  const files = getMigrationFiles();
  if (files.length === 0) {
    console.log("No migration files found.");
    return;
  }

  for (const file of files) {
    runMigration(psqlInvoker, cfg.DATABASE_URL, file);
  }

  console.log(`Applied ${files.length} migrations successfully.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
