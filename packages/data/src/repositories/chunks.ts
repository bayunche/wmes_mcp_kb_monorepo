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
  hier_path: string[];
  section_title: string | null;
  content_text: string | null;
  content_type: string;
  page_no: number | null;
  offset_start: number | null;
  offset_end: number | null;
  bbox: number[] | null;
  entities: unknown | null;
  topic_labels: string[] | null;
  quality_score: number | null;
  created_at: Date;
  doc_title: string;
  doc_source_uri: string | null;
  doc_tenant_id: string;
};

function mapRow(row: ChunkJoinRow): ChunkRecord {
  const chunk: Chunk = ChunkSchema.parse({
    chunkId: row.chunk_id,
    docId: row.doc_id,
    hierPath: row.hier_path,
    sectionTitle: row.section_title ?? undefined,
    contentText: row.content_text ?? undefined,
    contentType: row.content_type as Chunk["contentType"],
    pageNo: row.page_no ?? undefined,
    offsetStart: row.offset_start ?? undefined,
    offsetEnd: row.offset_end ?? undefined,
    bbox: row.bbox ?? undefined,
    entities: row.entities ?? undefined,
    topicLabels: row.topic_labels ?? undefined,
    qualityScore: row.quality_score ?? undefined,
    createdAt: row.created_at.toISOString()
  });

  return {
    chunk,
    document: {
      docId: row.doc_id,
      title: row.doc_title,
      sourceUri: row.doc_source_uri ?? undefined
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
        "chunks.content_text as content_text",
        "chunks.content_type as content_type",
        "chunks.page_no as page_no",
        "chunks.offset_start as offset_start",
        "chunks.offset_end as offset_end",
        "chunks.bbox as bbox",
        "chunks.entities as entities",
        "chunks.topic_labels as topic_labels",
        "chunks.quality_score as quality_score",
        "chunks.created_at as created_at",
        "documents.title as doc_title",
        "documents.source_uri as doc_source_uri",
        "documents.tenant_id as doc_tenant_id"
      ]);
  }

  private applyFilters(rows: ChunkJoinRow[], request: SearchRequest) {
    return rows.filter((row) => {
      if (request.filters?.tenantId && row.doc_tenant_id !== request.filters.tenantId) {
        return false;
      }
      if (request.filters?.docIds && !request.filters.docIds.includes(row.doc_id)) {
        return false;
      }
      return true;
    });
  }
}
