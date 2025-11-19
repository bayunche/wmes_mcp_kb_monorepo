CREATE TABLE IF NOT EXISTS tenant_configs (
  tenant_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS library_configs (
  library_id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenant_configs(tenant_id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_library_configs_tenant ON library_configs(tenant_id);

INSERT INTO tenant_configs (tenant_id, display_name)
VALUES ('default', '默认租户')
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO library_configs (library_id, tenant_id, display_name)
VALUES ('default', 'default', '默认知识库')
ON CONFLICT (library_id) DO NOTHING;
