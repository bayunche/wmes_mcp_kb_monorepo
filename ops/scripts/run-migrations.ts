import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { loadConfig } from "../../packages/core/src/config";

function assertPsqlAvailable() {
  try {
    execFileSync("psql", ["--version"], { stdio: "ignore" });
  } catch {
    throw new Error("psql command not found. Please install PostgreSQL client tools or run inside the db container.");
  }
}

function getMigrationFiles() {
  const migrationsDir = resolve(process.cwd(), "db/migrations");
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => resolve(migrationsDir, file));
}

function runMigration(databaseUrl: string, file: string) {
  console.log(`Applying ${file}`);
  execFileSync(
    "psql",
    [
      databaseUrl,
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      file
    ],
    { stdio: "inherit" }
  );
}

async function main() {
  const cfg = loadConfig({ envFile: process.env.ENV_FILE ?? ".env" });
  assertPsqlAvailable();
  const files = getMigrationFiles();
  if (files.length === 0) {
    console.log("No migration files found.");
    return;
  }

  for (const file of files) {
    runMigration(cfg.DATABASE_URL, file);
  }

  console.log(`Applied ${files.length} migrations successfully.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
