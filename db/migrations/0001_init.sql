-- Enable pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS documents (
    doc_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title         TEXT NOT NULL,
    source_uri    TEXT,
    mime_type     TEXT,
    language      TEXT,
    checksum      TEXT UNIQUE,
    size_bytes    BIGINT,
    ingest_status TEXT NOT NULL DEFAULT 'uploaded',
    tenant_id     TEXT NOT NULL DEFAULT 'default',
    tags          TEXT[],
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chunks (
    chunk_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id        UUID NOT NULL REFERENCES documents(doc_id) ON DELETE CASCADE,
    hier_path     TEXT[] NOT NULL,
    section_title TEXT,
    content_text  TEXT,
    content_type  TEXT NOT NULL,
    page_no       INTEGER,
    offset_start  INTEGER,
    offset_end    INTEGER,
    bbox          DOUBLE PRECISION[],
    entities      JSONB,
    topic_labels  TEXT[],
    quality_score DOUBLE PRECISION,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON chunks(doc_id);
CREATE INDEX IF NOT EXISTS idx_chunks_hier_path ON chunks USING GIN (hier_path);

CREATE TABLE IF NOT EXISTS embeddings (
    emb_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chunk_id   UUID NOT NULL REFERENCES chunks(chunk_id) ON DELETE CASCADE,
    modality   TEXT NOT NULL,
    model_name TEXT NOT NULL,
    vector     VECTOR(1024),
    dim        INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_embeddings_chunk_id ON embeddings(chunk_id);

CREATE TABLE IF NOT EXISTS relations (
    relation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    src_chunk_id UUID NOT NULL REFERENCES chunks(chunk_id) ON DELETE CASCADE,
    dst_chunk_id UUID NOT NULL REFERENCES chunks(chunk_id) ON DELETE CASCADE,
    rel_type     TEXT NOT NULL,
    weight       DOUBLE PRECISION DEFAULT 0.0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_relations_src ON relations(src_chunk_id);
CREATE INDEX IF NOT EXISTS idx_relations_dst ON relations(dst_chunk_id);

CREATE TABLE IF NOT EXISTS attachments (
    asset_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id     UUID REFERENCES documents(doc_id) ON DELETE CASCADE,
    chunk_id   UUID REFERENCES chunks(chunk_id) ON DELETE CASCADE,
    asset_type TEXT NOT NULL,
    object_key TEXT NOT NULL,
    mime_type  TEXT NOT NULL,
    page_no    INTEGER,
    bbox       DOUBLE PRECISION[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ingestion_jobs (
    job_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id        UUID REFERENCES documents(doc_id) ON DELETE CASCADE,
    status        TEXT NOT NULL,
    error_message TEXT,
    attempts      INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
