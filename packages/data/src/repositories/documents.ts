import { sql } from "kysely";
import type { Kysely } from "kysely";
import type { Document, DocumentSection } from "@kb/shared-schemas";
import { DocumentSchema, DocumentSectionSchema } from "@kb/shared-schemas";
import type { Database, DocumentsTable } from "../db/schema";
import type { DocumentRepository, DocumentStats } from "../types";

function mapRow(row: DocumentsTable): Document {
  return DocumentSchema.parse({
    docId: row.doc_id,
    title: row.title,
    sourceUri: row.source_uri ?? undefined,
    mimeType: row.mime_type ?? undefined,
    language: row.language ?? undefined,
    checksum: row.checksum ?? undefined,
    sizeBytes:
      row.size_bytes === null || row.size_bytes === undefined
        ? undefined
        : Number(row.size_bytes),
    ingestStatus: row.ingest_status as Document["ingestStatus"],
    tenantId: row.tenant_id,
    libraryId: row.library_id,
    tags: row.tags ?? undefined,
    errorMessage: row.error_message ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  });
}

export class PgDocumentRepository implements DocumentRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async upsert(document: Document): Promise<Document> {
    const now = new Date();
    const payload = {
      doc_id: document.docId,
      title: document.title,
      source_uri: document.sourceUri ?? null,
      mime_type: document.mimeType ?? null,
      language: document.language ?? null,
      checksum: document.checksum ?? null,
      size_bytes: document.sizeBytes ?? null,
      ingest_status: document.ingestStatus,
      tenant_id: document.tenantId ?? "default",
      library_id: document.libraryId ?? "default",
      tags: document.tags ?? null,
      error_message: document.errorMessage ?? null,
      updated_at: now,
      created_at: document.createdAt ? new Date(document.createdAt) : now
    };

    await this.db
      .insertInto("documents")
      .values(payload)
      .onConflict((oc) =>
        oc.column("doc_id").doUpdateSet({
          title: payload.title,
          source_uri: payload.source_uri,
          mime_type: payload.mime_type,
          language: payload.language,
          checksum: payload.checksum,
          size_bytes: payload.size_bytes,
          ingest_status: payload.ingest_status,
          tenant_id: payload.tenant_id,
          library_id: payload.library_id,
          tags: payload.tags,
          error_message: payload.error_message,
          updated_at: payload.updated_at
        })
      )
      .execute();

    const row = await this.db
      .selectFrom("documents")
      .selectAll()
      .where("doc_id", "=", document.docId)
      .executeTakeFirst();

    if (!row) {
      throw new Error("Failed to upsert document");
    }
    return mapRow(row);
  }

  async list(tenantId?: string, libraryId?: string): Promise<Document[]> {
    let query = this.db.selectFrom("documents").selectAll().orderBy("updated_at", "desc");
    if (tenantId) {
      query = query.where("tenant_id", "=", tenantId);
    }
    if (libraryId) {
      query = query.where("library_id", "=", libraryId);
    }
    const rows = await query.execute();
    return rows.map(mapRow);
  }

  async get(docId: string): Promise<Document | null> {
    const row = await this.db.selectFrom("documents").selectAll().where("doc_id", "=", docId).executeTakeFirst();
    return row ? mapRow(row) : null;
  }

  async updateTags(docId: string, tags: string[]): Promise<Document | null> {
    await this.db
      .updateTable("documents")
      .set({
        tags,
        updated_at: sql`NOW()`
      })
      .where("doc_id", "=", docId)
      .execute();
    return this.get(docId);
  }

  async updateStatus(docId: string, status: Document["ingestStatus"], errorMessage?: string): Promise<void> {
    await this.db
      .updateTable("documents")
      .set({
        ingest_status: status,
        error_message: errorMessage ?? null,
        updated_at: sql`NOW()`
      })
      .where("doc_id", "=", docId)
      .execute();
  }

  async delete(docId: string): Promise<void> {
    await this.db.deleteFrom("documents").where("doc_id", "=", docId).execute();
  }

  async count(tenantId?: string, libraryId?: string): Promise<number> {
    let query = this.db.selectFrom("documents").select(({ fn }) => fn.countAll().as("count"));
    if (tenantId) {
      query = query.where("tenant_id", "=", tenantId);
    }
    if (libraryId) {
      query = query.where("library_id", "=", libraryId);
    }
    const row = await query.executeTakeFirst();
    return Number(row?.count ?? 0);
  }

  async stats(tenantId?: string, libraryId?: string): Promise<DocumentStats> {
    const [documents, attachments, chunks, pendingJobs] = await Promise.all([
      this.count(tenantId, libraryId),
      this.countAttachments(tenantId, libraryId),
      this.countChunks(tenantId, libraryId),
      this.countPendingJobs(tenantId, libraryId)
    ]);
    return { documents, attachments, chunks, pendingJobs };
  }

  private async countAttachments(tenantId?: string, libraryId?: string): Promise<number> {
    let query = this.db.selectFrom("attachments").select(({ fn }) => fn.countAll().as("count"));
    if (tenantId || libraryId) {
      query = query.innerJoin("documents", "documents.doc_id", "attachments.doc_id");
    }
    if (tenantId) {
      query = query.where("documents.tenant_id", "=", tenantId);
    }
    if (libraryId) {
      query = query.where("documents.library_id", "=", libraryId);
    }
    const row = await query.executeTakeFirst();
    return Number(row?.count ?? 0);
  }

  private async countChunks(tenantId?: string, libraryId?: string): Promise<number> {
    let query = this.db.selectFrom("chunks").select(({ fn }) => fn.countAll().as("count"));
    if (tenantId || libraryId) {
      query = query.innerJoin("documents", "documents.doc_id", "chunks.doc_id");
    }
    if (tenantId) {
      query = query.where("documents.tenant_id", "=", tenantId);
    }
    if (libraryId) {
      query = query.where("documents.library_id", "=", libraryId);
    }
    const row = await query.executeTakeFirst();
    return Number(row?.count ?? 0);
  }

  private async countPendingJobs(tenantId?: string, libraryId?: string): Promise<number> {
    let query = this.db
      .selectFrom("ingestion_jobs")
      .select(({ fn }) => fn.countAll().as("count"))
      .where("status", "in", ["pending", "running"]);
    if (tenantId || libraryId) {
      query = query.innerJoin("documents", "documents.doc_id", "ingestion_jobs.doc_id");
    }
    if (tenantId) {
      query = query.where("documents.tenant_id", "=", tenantId);
    }
    if (libraryId) {
      query = query.where("documents.library_id", "=", libraryId);
    }
    const row = await query.executeTakeFirst();
    return Number(row?.count ?? 0);
  }

  async listSections(docId: string): Promise<DocumentSection[]> {
    const rows = await this.db
      .selectFrom("document_sections")
      .selectAll()
      .where("doc_id", "=", docId)
      .orderBy("order_index", "asc")
      .execute();
    return rows.map((row) =>
      DocumentSectionSchema.parse({
        sectionId: row.section_id,
        docId: row.doc_id,
        parentSectionId: row.parent_section_id ?? undefined,
        title: row.title,
        summary: row.summary ?? undefined,
        level: row.level,
        path: row.path ?? [],
        order: row.order_index,
        tags: row.tags ?? undefined,
        keywords: row.keywords ?? undefined,
        createdAt: row.created_at.toISOString()
      })
    );
  }
}
