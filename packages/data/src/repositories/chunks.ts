import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { ChunkRecord, ChunkRepository } from "@kb/core/src/retrieval";
import type { Chunk } from "@kb/shared-schemas";
import { ChunkSchema } from "@kb/shared-schemas";
import type { Database } from "../db/schema";
import type { VectorIndex } from "../types";
import type { SearchRequest } from "@kb/shared-schemas";

type ChunkJoinRow = {
  chunk_id: string;
  doc_id: string;
  library_id: string;
  hier_path: string[];
  section_title: string | null;
  semantic_title: string | null;
  content_text: string | null;
  content_type: string;
  page_no: number | null;
  offset_start: number | null;
  offset_end: number | null;
  bbox: number[] | null;
  entities: unknown | null;
  topic_labels: string[] | null;
  topics: string[] | null;
  keywords: string[] | null;
  semantic_tags: string[] | null;
  semantic_metadata: unknown | null;
  env_labels: string[] | null;
  biz_entities: string[] | null;
  ner_entities: unknown | null;
  parent_section_id: string | null;
  parent_section_path: string[] | null;
  context_summary: string | null;
  quality_score: number | null;
  created_at: Date;
  doc_title: string;
  doc_source_uri: string | null;
  doc_tenant_id: string;
  doc_library_id: string;
  doc_tags: string[] | null;
  doc_ingest_status: string;
};

function mapRow(row: ChunkJoinRow): ChunkRecord {
  const nerEntities = Array.isArray(row.ner_entities) ? row.ner_entities : [];
  const chunk: Chunk = ChunkSchema.parse({
    chunkId: row.chunk_id,
    docId: row.doc_id,
    hierPath: row.hier_path,
    sectionTitle: row.section_title ?? undefined,
    semanticTitle: row.semantic_title ?? undefined,
    contentText: row.content_text ?? undefined,
    contentType: row.content_type as Chunk["contentType"],
    pageNo: row.page_no ?? undefined,
    offsetStart: row.offset_start ?? undefined,
    offsetEnd: row.offset_end ?? undefined,
    bbox: row.bbox ?? undefined,
    entities: row.entities ?? undefined,
    topicLabels: row.topic_labels ?? undefined,
    topics: row.topics ?? undefined,
    keywords: row.keywords ?? undefined,
    semanticTags: row.semantic_tags ?? undefined,
    semanticMetadata: row.semantic_metadata ?? undefined,
    envLabels: row.env_labels ?? undefined,
    bizEntities: row.biz_entities ?? undefined,
    nerEntities,
    parentSectionId: row.parent_section_id ?? undefined,
    parentSectionPath: row.parent_section_path ?? undefined,
    contextSummary: row.context_summary ?? undefined,
    qualityScore: row.quality_score ?? undefined,
    createdAt: row.created_at.toISOString()
  });

  return {
    chunk,
    document: {
      docId: row.doc_id,
      title: row.doc_title,
      sourceUri: row.doc_source_uri ?? undefined,
      tenantId: row.doc_tenant_id,
      libraryId: row.doc_library_id,
      ingestStatus: row.doc_ingest_status as ChunkRecord["document"]["ingestStatus"],
      tags: row.doc_tags ?? undefined
    },
    neighbors: [],
    topicLabels: chunk.topicLabels
  };
}

export class PgChunkRepository implements ChunkRepository {
  constructor(private readonly db: Kysely<Database>, private readonly vectorIndex?: VectorIndex) {}

  async get(chunkId: string): Promise<ChunkRecord | null> {
    const row = await this.baseQuery().where("chunks.chunk_id", "=", chunkId).executeTakeFirst();
    return row ? mapRow(row) : null;
  }

  async getMany(chunkIds: string[]): Promise<ChunkRecord[]> {
    if (!chunkIds.length) return [];
    const rows = await this.baseQuery().where("chunks.chunk_id", "in", chunkIds).execute();
    const mapped = rows.map(mapRow);
    const order = new Map(chunkIds.map((id, idx) => [id, idx]));
    return mapped.sort((a, b) => (order.get(a.chunk.chunkId) ?? 0) - (order.get(b.chunk.chunkId) ?? 0));
  }

  async listByDocument(docId: string): Promise<ChunkRecord[]> {
    const rows = await this.baseQuery().where("chunks.doc_id", "=", docId).orderBy("chunks.created_at", "asc").execute();
    return rows.map(mapRow);
  }

  async listByLibrary(libraryId: string, options: { docId?: string; limit?: number } = {}): Promise<ChunkRecord[]> {
    let query = this.baseQuery().where("documents.library_id", "=", libraryId);
    if (options.docId) {
      query = query.where("chunks.doc_id", "=", options.docId);
    }
    if (options.limit) {
      query = query.limit(options.limit);
    }
    const rows = await query.orderBy("chunks.created_at", "desc").execute();
    return rows.map(mapRow);
  }

  async updateTopicLabels(chunkId: string, labels: string[]): Promise<void> {
    await this.db
      .updateTable("chunks")
      .set({ topic_labels: labels })
      .where("chunk_id", "=", chunkId)
      .execute();
  }

  async searchCandidates(request: SearchRequest, queryVector: number[]): Promise<ChunkRecord[]> {
    const limit = request.limit ?? 10;
    if (this.vectorIndex) {
      const hits = await this.vectorIndex.search(queryVector, limit);
      if (hits.length) {
        const chunkIds = hits.map((hit) => hit.chunkId);
        const rows = await this.baseQuery().where("chunks.chunk_id", "in", chunkIds).execute();
        const filteredRows = this.applyFilters(rows, request);
        const mapped = filteredRows.map(mapRow);
        const scoreMap = new Map(hits.map((hit) => [hit.chunkId, hit.score]));
        return mapped.sort(
          (a, b) => (scoreMap.get(b.chunk.chunkId) ?? 0) - (scoreMap.get(a.chunk.chunkId) ?? 0)
        );
      }
    }

    // Fallback：使用簡單全文搜尋
    const rows = await this.baseQuery()
      .where((eb) => eb("chunks.content_text", "is not", null))
      .orderBy("chunks.created_at", "desc")
      .limit(limit)
      .execute();
    const filtered = this.applyFilters(rows, request);
    return filtered.map(mapRow);
  }

  private baseQuery() {
    return this.db
      .selectFrom("chunks")
      .innerJoin("documents", "documents.doc_id", "chunks.doc_id")
      .select([
        "chunks.chunk_id as chunk_id",
        "chunks.doc_id as doc_id",
        "chunks.hier_path as hier_path",
        "chunks.section_title as section_title",
        "chunks.semantic_title as semantic_title",
        "chunks.content_text as content_text",
        "chunks.content_type as content_type",
        "chunks.page_no as page_no",
        "chunks.offset_start as offset_start",
        "chunks.offset_end as offset_end",
        "chunks.bbox as bbox",
        "chunks.entities as entities",
        "chunks.topic_labels as topic_labels",
        "chunks.topics as topics",
        "chunks.keywords as keywords",
        "chunks.semantic_tags as semantic_tags",
        "chunks.semantic_metadata as semantic_metadata",
        "chunks.env_labels as env_labels",
        "chunks.biz_entities as biz_entities",
        "chunks.ner_entities as ner_entities",
        "chunks.parent_section_id as parent_section_id",
        "chunks.parent_section_path as parent_section_path",
        "chunks.context_summary as context_summary",
        "chunks.quality_score as quality_score",
        "chunks.created_at as created_at",
        "documents.title as doc_title",
        "documents.source_uri as doc_source_uri",
        "documents.tenant_id as doc_tenant_id",
        "documents.library_id as doc_library_id",
        "documents.tags as doc_tags",
        "documents.ingest_status as doc_ingest_status"
      ]);
  }

  async listByLibrary(libraryId: string, options: { docId?: string; limit?: number } = {}): Promise<ChunkRecord[]> {
    let query = this.baseQuery().where("documents.library_id", "=", libraryId);
    if (options.docId) {
      query = query.where("chunks.doc_id", "=", options.docId);
    }
    if (options.limit) {
      query = query.limit(options.limit);
    }
    const rows = await query.orderBy("chunks.created_at", "desc").execute();
    return rows.map(mapRow);
  }

  private applyFilters(rows: ChunkJoinRow[], request: SearchRequest) {
    return rows.filter((row) => {
      if (request.filters?.tenantId && row.doc_tenant_id !== request.filters.tenantId) {
        return false;
      }
      if (request.filters?.docIds && !request.filters.docIds.includes(row.doc_id)) {
        return false;
      }
      if (request.filters?.semanticTags?.length) {
        const semanticTags = new Set(
          (row.semantic_tags ?? []).map((tag) => (tag as string).toLowerCase())
        );
        row.topic_labels?.forEach((label) => semanticTags.add((label as string).toLowerCase()));
        const matches = request.filters.semanticTags.some((tag) =>
          semanticTags.has(tag.toLowerCase())
        );
        if (!matches) {
          return false;
        }
      }
      if (request.filters?.envLabels?.length) {
        const envLabels = new Set(
          (row.env_labels ?? []).map((label) => (label as string).toLowerCase())
        );
        const matches = request.filters.envLabels.some((label) =>
          envLabels.has(label.toLowerCase())
        );
        if (!matches) {
          return false;
        }
      }
      if (request.filters?.metadataQuery && Object.keys(request.filters.metadataQuery).length) {
        const metadata = (row.semantic_metadata as Record<string, unknown> | null) ?? undefined;
        const extra = metadata?.extra as Record<string, unknown> | undefined;
        const hasMatch = Object.entries(request.filters.metadataQuery).every(
          ([key, value]) => extra && key in extra && extra[key] === value
        );
        if (!hasMatch) {
          return false;
        }
      }
      return true;
    });
  }
}
