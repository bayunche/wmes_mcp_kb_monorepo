import type { Kysely } from "kysely";
import { sql } from "kysely";
import type {
  KnowledgeBundle,
  Chunk,
  Embedding,
  Attachment
} from "@kb/shared-schemas";
import type { Database } from "../db/schema";
import type { KnowledgeWriter, VectorIndex } from "../types";

function mapChunkToRow(chunk: Chunk) {
  return {
    chunk_id: chunk.chunkId,
    doc_id: chunk.docId,
    hier_path: chunk.hierPath,
    section_title: chunk.sectionTitle ?? null,
    content_text: chunk.contentText ?? null,
    content_type: chunk.contentType,
    page_no: chunk.pageNo ?? null,
    offset_start: chunk.offsetStart ?? null,
    offset_end: chunk.offsetEnd ?? null,
    bbox: chunk.bbox ?? null,
    entities: chunk.entities ?? null,
    topic_labels: chunk.topicLabels ?? null,
    quality_score: chunk.qualityScore ?? null,
    created_at: chunk.createdAt ? new Date(chunk.createdAt) : sql`NOW()`
  };
}

function mapEmbeddingToRow(embedding: Embedding) {
  return {
    emb_id: embedding.embId,
    chunk_id: embedding.chunkId,
    modality: embedding.modality,
    model_name: embedding.modelName,
    vector: null,
    dim: embedding.dim,
    created_at: embedding.createdAt ? new Date(embedding.createdAt) : sql`NOW()`
  };
}

function mapAttachmentToRow(attachment: Attachment) {
  return {
    asset_id: attachment.assetId,
    doc_id: attachment.docId ?? null,
    chunk_id: attachment.chunkId ?? null,
    asset_type: attachment.assetType,
    object_key: attachment.objectKey,
    mime_type: attachment.mimeType,
    page_no: attachment.pageNo ?? null,
    bbox: attachment.bbox ?? null,
    created_at: attachment.createdAt ? new Date(attachment.createdAt) : sql`NOW()`
  };
}

export class PgKnowledgeWriter implements KnowledgeWriter {
  constructor(private readonly db: Kysely<Database>, private readonly vectorIndex?: VectorIndex) {}

  async persistBundle(bundle: KnowledgeBundle): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      const document = bundle.document;
      const docPayload = {
        doc_id: document.docId,
        title: document.title,
        source_uri: document.sourceUri ?? null,
        mime_type: document.mimeType ?? null,
        language: document.language ?? null,
        checksum: document.checksum ?? null,
        size_bytes: document.sizeBytes ?? null,
        ingest_status: document.ingestStatus,
        tenant_id: document.tenantId ?? "default",
        tags: document.tags ?? null,
        created_at: document.createdAt ? new Date(document.createdAt) : sql`NOW()`,
        updated_at: sql`NOW()`
      };

      await trx
        .insertInto("documents")
        .values(docPayload)
        .onConflict((oc) =>
          oc.column("doc_id").doUpdateSet({
            title: docPayload.title,
            source_uri: docPayload.source_uri,
            mime_type: docPayload.mime_type,
            language: docPayload.language,
            checksum: docPayload.checksum,
            size_bytes: docPayload.size_bytes,
            ingest_status: docPayload.ingest_status,
            tenant_id: docPayload.tenant_id,
            tags: docPayload.tags,
            updated_at: sql`NOW()`
          })
        )
        .execute();

      await trx.deleteFrom("attachments").where("doc_id", "=", document.docId).execute();
      await trx.deleteFrom("chunks").where("doc_id", "=", document.docId).execute();

      if (bundle.chunks.length) {
        await trx.insertInto("chunks").values(bundle.chunks.map(mapChunkToRow)).execute();
      }

      if (bundle.embeddings?.length) {
        await trx.insertInto("embeddings").values(bundle.embeddings.map(mapEmbeddingToRow)).execute();
      }

      if (bundle.attachments?.length) {
        await trx.insertInto("attachments").values(bundle.attachments.map(mapAttachmentToRow)).execute();
      }
    });

    if (this.vectorIndex && bundle.embeddings?.length) {
      await this.vectorIndex.upsert(
        bundle.embeddings.map((embedding) => ({
          chunkId: embedding.chunkId,
          vector: embedding.vector,
          payload: {
            docId: bundle.document.docId,
            tenantId: bundle.document.tenantId ?? "default",
            topicLabels: bundle.chunks
              .find((chunk) => chunk.chunkId === embedding.chunkId)
              ?.topicLabels ?? []
          }
        }))
      );
    }
  }
}
