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
  library_id: string;
  tags: string[] | null;
  error_message: string | null;
  status_meta: unknown | null;
  created_at: Date;
  updated_at: Date;
}

export interface TenantConfigsTable {
  tenant_id: string;
  display_name: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface LibraryConfigsTable {
  library_id: string;
  tenant_id: string | null;
  display_name: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ChunksTable {
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
}

export interface DocumentSectionsTable {
  section_id: string;
  doc_id: string;
  parent_section_id: string | null;
  title: string;
  summary: string | null;
  level: number;
  path: string[];
  order_index: number;
  tags: string[] | null;
  keywords: string[] | null;
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
  library_id: string;
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
  library_id: string;
  status: string;
  error_message: string | null;
  attempts: number;
  created_at: Date;
  updated_at: Date;
}

export interface ModelSettingsTable {
  setting_id: string;
  tenant_id: string;
  library_id: string;
  provider: string;
  base_url: string;
  model_name: string;
  api_key: string | null;
  options: unknown | null;
  model_role: string;
  display_name: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface VectorLogsTable {
  log_id: string;
  chunk_id: string | null;
  doc_id: string;
  tenant_id: string;
  library_id: string;
  model_role: string;
  provider: string;
  model_name: string;
  driver: string;
  status: string;
  duration_ms: number;
  vector_dim: number | null;
  input_chars: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  ocr_used: boolean | null;
  metadata: unknown | null;
  error_message: string | null;
  created_at: Date;
}

export interface Database {
  documents: DocumentsTable;
  tenant_configs: TenantConfigsTable;
  library_configs: LibraryConfigsTable;
  chunks: ChunksTable;
  document_sections: DocumentSectionsTable;
  embeddings: EmbeddingsTable;
  attachments: AttachmentsTable;
  relations: RelationsTable;
  ingestion_jobs: IngestionJobsTable;
  model_settings: ModelSettingsTable;
  vector_logs: VectorLogsTable;
}
