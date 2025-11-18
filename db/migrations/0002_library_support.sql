-- Add library_id columns and indexes to support per-library governance
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS library_id TEXT NOT NULL DEFAULT 'default';

ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS library_id TEXT NOT NULL DEFAULT 'default';

ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS library_id TEXT NOT NULL DEFAULT 'default';

ALTER TABLE ingestion_jobs
  ADD COLUMN IF NOT EXISTS library_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_documents_library ON documents(library_id);
CREATE INDEX IF NOT EXISTS idx_chunks_library ON chunks(library_id);
CREATE INDEX IF NOT EXISTS idx_attachments_library ON attachments(library_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_library ON ingestion_jobs(library_id);
