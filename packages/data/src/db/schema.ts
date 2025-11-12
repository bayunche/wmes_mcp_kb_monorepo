export interface DocumentsTable {
  doc_id: string;
  title: string;
  source_uri: string | null;
  mime_type: string | null;
  language: string | null;
  checksum: string | null;
  size_bytes: number | null;
  ingest_status: string;
  tenant_id: string;
  tags: string[] | null;
  created_at: Date;
  updated_at: Date;
}

export interface ChunksTable {
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
}

export interface EmbeddingsTable {
  emb_id: string;
  chunk_id: string;
  modality: string;
  model_name: string;
  vector: unknown | null;
  dim: number;
  created_at: Date;
}

export interface AttachmentsTable {
  asset_id: string;
  doc_id: string | null;
  chunk_id: string | null;
  asset_type: string;
  object_key: string;
  mime_type: string;
  page_no: number | null;
  bbox: number[] | null;
  created_at: Date;
}

export interface RelationsTable {
  relation_id: string;
  src_chunk_id: string;
  dst_chunk_id: string;
  rel_type: string;
  weight: number | null;
  created_at: Date;
}

export interface IngestionJobsTable {
  job_id: string;
  doc_id: string | null;
  status: string;
  error_message: string | null;
  attempts: number;
  created_at: Date;
  updated_at: Date;
}

export interface Database {
  documents: DocumentsTable;
  chunks: ChunksTable;
  embeddings: EmbeddingsTable;
  attachments: AttachmentsTable;
  relations: RelationsTable;
  ingestion_jobs: IngestionJobsTable;
}
