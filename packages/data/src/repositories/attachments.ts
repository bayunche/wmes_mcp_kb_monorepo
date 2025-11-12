import type { Kysely } from "kysely";
import { AttachmentSchema, type Attachment } from "@kb/shared-schemas";
import type { AttachmentRepository } from "../types";
import type { Database } from "../db/schema";

function mapAttachment(row: {
  asset_id: string;
  doc_id: string | null;
  chunk_id: string | null;
  asset_type: string;
  object_key: string;
  mime_type: string;
  page_no: number | null;
  bbox: number[] | null;
  created_at: Date;
}): Attachment {
  return AttachmentSchema.parse({
    assetId: row.asset_id,
    docId: row.doc_id ?? undefined,
    chunkId: row.chunk_id ?? undefined,
    assetType: row.asset_type as Attachment["assetType"],
    objectKey: row.object_key,
    mimeType: row.mime_type,
    pageNo: row.page_no ?? undefined,
    bbox: row.bbox ?? undefined,
    createdAt: row.created_at.toISOString()
  });
}

export class PgAttachmentRepository implements AttachmentRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async listByChunkIds(chunkIds: string[]): Promise<Attachment[]> {
    if (!chunkIds.length) return [];
    const rows = await this.db
      .selectFrom("attachments")
      .selectAll()
      .where("chunk_id", "in", chunkIds)
      .execute();
    return rows.map(mapAttachment);
  }

  async listByDocument(docId: string): Promise<Attachment[]> {
    const rows = await this.db
      .selectFrom("attachments")
      .selectAll()
      .where("doc_id", "=", docId)
      .execute();
    return rows.map(mapAttachment);
  }

  async deleteByDocId(docId: string): Promise<void> {
    await this.db.deleteFrom("attachments").where("doc_id", "=", docId).execute();
  }

  async count(tenantId?: string): Promise<number> {
    if (!tenantId) {
      const row = await this.db
        .selectFrom("attachments")
        .select(({ fn }) => fn.countAll().as("count"))
        .executeTakeFirst();
      return Number(row?.count ?? 0);
    }
    const row = await this.db
      .selectFrom("attachments")
      .innerJoin("documents", "documents.doc_id", "attachments.doc_id")
      .select(({ fn }) => fn.countAll().as("count"))
      .where("documents.tenant_id", "=", tenantId)
      .executeTakeFirst();
    return Number(row?.count ?? 0);
  }
}
