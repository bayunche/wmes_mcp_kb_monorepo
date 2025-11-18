ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS semantic_title TEXT,
  ADD COLUMN IF NOT EXISTS topics TEXT[],
  ADD COLUMN IF NOT EXISTS keywords TEXT[],
  ADD COLUMN IF NOT EXISTS ner_entities JSONB,
  ADD COLUMN IF NOT EXISTS parent_section_id UUID,
  ADD COLUMN IF NOT EXISTS parent_section_path TEXT[];

CREATE TABLE IF NOT EXISTS document_sections (
    section_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id            UUID NOT NULL REFERENCES documents(doc_id) ON DELETE CASCADE,
    parent_section_id UUID NULL REFERENCES document_sections(section_id) ON DELETE CASCADE,
    title             TEXT NOT NULL,
    summary           TEXT,
    level             INTEGER NOT NULL DEFAULT 1,
    path              TEXT[] NOT NULL DEFAULT '{}',
    order_index       INTEGER NOT NULL DEFAULT 0,
    tags              TEXT[],
    keywords          TEXT[],
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_sections_doc ON document_sections(doc_id);
CREATE INDEX IF NOT EXISTS idx_document_sections_parent ON document_sections(parent_section_id);
