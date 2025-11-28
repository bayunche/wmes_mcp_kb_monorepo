-- 扩展模型角色枚举，支持查询改写与语义重拍
ALTER TABLE model_settings DROP CONSTRAINT IF EXISTS model_settings_model_role_check;
ALTER TABLE model_settings
  ADD CONSTRAINT model_settings_model_role_check
  CHECK (model_role IN ('embedding', 'tagging', 'metadata', 'ocr', 'rerank', 'structure', 'query_rewrite', 'semantic_rerank'));

ALTER TABLE vector_logs DROP CONSTRAINT IF EXISTS vector_logs_model_role_check;
ALTER TABLE vector_logs
  ADD CONSTRAINT vector_logs_model_role_check
  CHECK (model_role IN ('embedding', 'tagging', 'metadata', 'ocr', 'rerank', 'structure', 'query_rewrite', 'semantic_rerank'));
