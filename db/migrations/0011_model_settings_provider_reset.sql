-- 再次重置 provider 约束，确保 openai/ollama/local 可写入（幂等执行）
ALTER TABLE model_settings DROP CONSTRAINT IF EXISTS model_settings_provider_check;
ALTER TABLE model_settings
  ADD CONSTRAINT model_settings_provider_check
  CHECK (provider IN ('openai', 'ollama', 'local'));
