import type { Kysely } from "kysely";
import { sql } from "kysely";
import { VectorLogSchema } from "@kb/shared-schemas";
import type { Database, VectorLogsTable } from "../db/schema";
import type { VectorLogRepository, VectorLogInput } from "../types";

function mapRow(row: VectorLogsTable) {
  return VectorLogSchema.parse({
    logId: row.log_id,
    chunkId: row.chunk_id ?? undefined,
    docId: row.doc_id,
    tenantId: row.tenant_id,
    libraryId: row.library_id,
    modelRole: row.model_role,
    provider: row.provider,
    modelName: row.model_name,
    driver: row.driver === "local" ? "local" : "remote",
    status: row.status === "success" ? "success" : "failed",
    durationMs: row.duration_ms,
    vectorDim: row.vector_dim ?? undefined,
    inputChars: row.input_chars ?? undefined,
    inputTokens: row.input_tokens ?? undefined,
    outputTokens: row.output_tokens ?? undefined,
    ocrUsed: row.ocr_used ?? undefined,
    metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
    errorMessage: row.error_message ?? undefined,
    createdAt: row.created_at.toISOString()
  });
}

export class PgVectorLogRepository implements VectorLogRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async append(logs: VectorLogInput[]): Promise<void> {
    if (!logs.length) {
      return;
    }
    await this.db
      .insertInto("vector_logs")
      .values(
        logs.map((log) => ({
          log_id: log.logId ?? sql`gen_random_uuid()`,
          chunk_id: log.chunkId ?? null,
          doc_id: log.docId,
          tenant_id: log.tenantId ?? "default",
          library_id: log.libraryId ?? "default",
          model_role: log.modelRole,
          provider: log.provider,
          model_name: log.modelName,
          driver: log.driver,
          status: log.status,
          duration_ms: log.durationMs,
          vector_dim: log.vectorDim ?? null,
          input_chars: log.inputChars ?? null,
          input_tokens: log.inputTokens ?? null,
          output_tokens: log.outputTokens ?? null,
          ocr_used: typeof log.ocrUsed === "boolean" ? log.ocrUsed : null,
          metadata: log.metadata ?? null,
          error_message: log.errorMessage ?? null,
          created_at: log.createdAt ? new Date(log.createdAt) : sql`NOW()`
        }))
      )
      .execute();
  }

  async list(params: {
    docId?: string;
    chunkId?: string;
    tenantId?: string;
    libraryId?: string;
    limit?: number;
  }) {
    let query = this.db.selectFrom("vector_logs").selectAll();
    if (params.docId) {
      query = query.where("doc_id", "=", params.docId);
    }
    if (params.chunkId) {
      query = query.where("chunk_id", "=", params.chunkId);
    }
    if (params.tenantId) {
      query = query.where("tenant_id", "=", params.tenantId);
    }
    if (params.libraryId) {
      query = query.where("library_id", "=", params.libraryId);
    }
    const rows = await query
      .orderBy("created_at", "desc")
      .limit(Math.min(params.limit ?? 100, 200))
      .execute();
    return rows.map(mapRow);
  }
}
