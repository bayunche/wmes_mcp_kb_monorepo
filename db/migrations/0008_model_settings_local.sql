-- 允许 model_settings.provider 存储 local
ALTER TABLE model_settings DROP CONSTRAINT IF EXISTS model_settings_provider_check;
ALTER TABLE model_settings
  ADD CONSTRAINT model_settings_provider_check
  CHECK (provider IN ('openai', 'ollama', 'local'));

