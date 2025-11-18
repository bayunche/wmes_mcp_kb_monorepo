ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS semantic_metadata JSONB,
  ADD COLUMN IF NOT EXISTS semantic_tags TEXT[],
  ADD COLUMN IF NOT EXISTS env_labels TEXT[],
  ADD COLUMN IF NOT EXISTS context_summary TEXT,
  ADD COLUMN IF NOT EXISTS biz_entities TEXT[];

ALTER TABLE model_settings
  ADD COLUMN IF NOT EXISTS model_role TEXT NOT NULL DEFAULT 'tagging',
  ADD COLUMN IF NOT EXISTS display_name TEXT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_model_settings_scope') THEN
    DROP INDEX idx_model_settings_scope;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_model_settings_scope_role ON model_settings(tenant_id, library_id, model_role);

CREATE TABLE IF NOT EXISTS vector_logs (
    log_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chunk_id      UUID REFERENCES chunks(chunk_id) ON DELETE SET NULL,
    doc_id        UUID NOT NULL REFERENCES documents(doc_id) ON DELETE CASCADE,
    tenant_id     TEXT NOT NULL DEFAULT 'default',
    library_id    TEXT NOT NULL DEFAULT 'default',
    model_role    TEXT NOT NULL CHECK (model_role IN ('embedding', 'tagging', 'metadata', 'ocr', 'rerank')),
    provider      TEXT NOT NULL,
    model_name    TEXT NOT NULL,
    driver        TEXT NOT NULL CHECK (driver IN ('local', 'remote')),
    status        TEXT NOT NULL CHECK (status IN ('success', 'failed')),
    duration_ms   INTEGER NOT NULL,
    vector_dim    INTEGER,
    input_chars   INTEGER,
    input_tokens  INTEGER,
    output_tokens INTEGER,
    ocr_used      BOOLEAN,
    metadata      JSONB,
    error_message TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vector_logs_chunk ON vector_logs(chunk_id);
CREATE INDEX IF NOT EXISTS idx_vector_logs_doc ON vector_logs(doc_id);
CREATE INDEX IF NOT EXISTS idx_vector_logs_created ON vector_logs(created_at DESC);
