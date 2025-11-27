import type { Kysely } from "kysely";
import { sql } from "kysely";
import type {
  KnowledgeBundle,
  Chunk,
  Embedding,
  Attachment,
  DocumentSection
} from "@kb/shared-schemas";
import type { Database } from "../db/schema";
import type { KnowledgeWriter, VectorIndex } from "../types";

function mapChunkToRow(chunk: Chunk, libraryId: string) {
  return {
    chunk_id: chunk.chunkId,
    doc_id: chunk.docId,
    library_id: libraryId,
    hier_path: chunk.hierPath,
    section_title: chunk.sectionTitle ?? null,
    semantic_title: chunk.semanticTitle ?? chunk.semanticMetadata?.title ?? null,
    content_text: chunk.contentText ?? null,
    content_type: chunk.contentType,
    page_no: chunk.pageNo ?? null,
    offset_start: chunk.offsetStart ?? null,
    offset_end: chunk.offsetEnd ?? null,
    bbox: chunk.bbox ?? null,
    entities: chunk.entities ?? null,
    topic_labels: chunk.topicLabels ?? null,
    topics: chunk.topics ?? chunk.semanticMetadata?.topics ?? null,
    keywords: chunk.keywords ?? chunk.semanticMetadata?.keywords ?? null,
    semantic_tags: chunk.semanticTags ?? chunk.semanticMetadata?.semanticTags ?? null,
    semantic_metadata: chunk.semanticMetadata ?? null,
    env_labels: chunk.envLabels ?? chunk.semanticMetadata?.envLabels ?? null,
    biz_entities: chunk.bizEntities ?? chunk.semanticMetadata?.bizEntities ?? null,
    ner_entities: Array.isArray(chunk.nerEntities)
      ? chunk.nerEntities
      : Array.isArray(chunk.semanticMetadata?.entities)
        ? chunk.semanticMetadata?.entities
        : [],
    parent_section_id: chunk.parentSectionId ?? null,
    parent_section_path: chunk.parentSectionPath ?? chunk.semanticMetadata?.parentSectionPath ?? null,
    context_summary: chunk.contextSummary ?? chunk.semanticMetadata?.contextSummary ?? null,
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

function mapAttachmentToRow(attachment: Attachment, libraryId: string) {
  return {
    asset_id: attachment.assetId,
    doc_id: attachment.docId ?? null,
    chunk_id: attachment.chunkId ?? null,
    library_id: libraryId,
    asset_type: attachment.assetType,
    object_key: attachment.objectKey,
    mime_type: attachment.mimeType,
    page_no: attachment.pageNo ?? null,
    bbox: attachment.bbox ?? null,
    created_at: attachment.createdAt ? new Date(attachment.createdAt) : sql`NOW()`
  };
}

function mapSectionToRow(section: DocumentSection) {
  return {
    section_id: section.sectionId,
    doc_id: section.docId,
    parent_section_id: section.parentSectionId ?? null,
    title: section.title,
    summary: section.summary ?? null,
    level: section.level ?? 1,
    path: section.path ?? [],
    order_index: section.order ?? 0,
    tags: section.tags ?? null,
    keywords: section.keywords ?? null,
    created_at: section.createdAt ? new Date(section.createdAt) : sql`NOW()`
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
        library_id: document.libraryId ?? "default",
        tags: document.tags ?? null,
        error_message: document.errorMessage ?? null,
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
            library_id: docPayload.library_id,
            tags: docPayload.tags,
            error_message: docPayload.error_message,
            updated_at: sql`NOW()`
          })
        )
        .execute();

      await trx.deleteFrom("attachments").where("doc_id", "=", document.docId).execute();
      await trx.deleteFrom("chunks").where("doc_id", "=", document.docId).execute();
      await trx.deleteFrom("document_sections").where("doc_id", "=", document.docId).execute();

      const libraryId = document.libraryId ?? "default";

      if (bundle.sections?.length) {
        await trx
          .insertInto("document_sections")
          .values(bundle.sections.map((section) => mapSectionToRow(section)))
          .execute();
      }

      if (bundle.chunks.length) {
        await trx
          .insertInto("chunks")
          .values(bundle.chunks.map((chunk) => mapChunkToRow(chunk, libraryId)))
          .execute();
      }

      if (bundle.embeddings?.length) {
        await trx.insertInto("embeddings").values(bundle.embeddings.map(mapEmbeddingToRow)).execute();
      }

      if (bundle.attachments?.length) {
        await trx
          .insertInto("attachments")
          .values(bundle.attachments.map((attachment) => mapAttachmentToRow(attachment, libraryId)))
          .execute();
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
            libraryId: bundle.document.libraryId ?? "default",
            topicLabels: bundle.chunks
              .find((chunk) => chunk.chunkId === embedding.chunkId)
              ?.topicLabels ?? []
          }
        }))
      );
    }
  }
}
