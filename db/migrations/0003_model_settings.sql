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

-- 早期设计为唯一索引，但在新增 model_role 后会天然存在多条同租户/库记录，
-- 为了幂等重放迁移，改为普通索引，后续 0004 会替换为带 model_role 的唯一索引。
CREATE INDEX IF NOT EXISTS idx_model_settings_scope ON model_settings(tenant_id, library_id);
