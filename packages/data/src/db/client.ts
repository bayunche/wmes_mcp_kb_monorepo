import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { AppConfig } from "@kb/core/src/config";
import type { Database } from "./schema";

export interface DbClientOptions {
  maxConnections?: number;
}

export function createDbClient(config: AppConfig, options: DbClientOptions = {}) {
  const pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: options.maxConnections ?? 10,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined
  });

  const dialect = new PostgresDialect({ pool });
  const db = new Kysely<Database>({ dialect });

  return {
    db,
    async destroy() {
      await db.destroy();
      await pool.end();
    }
  };
}
