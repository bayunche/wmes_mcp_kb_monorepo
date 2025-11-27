-- 确保 model_settings.provider 支持 openai/ollama/local（幂等重复声明）
ALTER TABLE model_settings DROP CONSTRAINT IF EXISTS model_settings_provider_check;
ALTER TABLE model_settings
  ADD CONSTRAINT model_settings_provider_check
  CHECK (provider IN ('openai', 'ollama', 'local'));
