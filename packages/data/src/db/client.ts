import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { AppConfig } from "@kb/core/src/config";
import type { Database } from "./schema";

export interface DbClientOptions {
  maxConnections?: number;
}

export function createDbClient(config: AppConfig, options: DbClientOptions = {}) {
  // 使用 simple 协议可规避 bind/parse 参数格式不匹配的问题；默认开启，设置 PG_SIMPLE=false 可恢复扩展协议
  const useSimple = process.env.PG_SIMPLE !== "false";
  const pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: options.maxConnections ?? 10,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    simple: useSimple
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
