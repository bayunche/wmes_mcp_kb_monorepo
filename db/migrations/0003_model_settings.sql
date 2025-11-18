CREATE TABLE IF NOT EXISTS model_settings (
    setting_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    TEXT NOT NULL DEFAULT 'default',
    library_id   TEXT NOT NULL DEFAULT 'default',
    provider     TEXT NOT NULL CHECK (provider IN ('openai', 'ollama')),
    base_url     TEXT NOT NULL,
    model_name   TEXT NOT NULL,
    api_key      TEXT,
    options      JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_model_settings_scope ON model_settings(tenant_id, library_id);
