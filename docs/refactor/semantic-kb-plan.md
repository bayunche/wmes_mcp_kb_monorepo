# 语义知识库重构计划（2025-11-17，Codex）

## 1. 目标流程概述

| 场景 | 流程 | 关键说明 |
| --- | --- | --- |
| 可直接解析的 doc/docx/txt/html | 上传 → 文档注册 (/upload) → Worker `fetchSource` 读取原始二进制 → `parseDocument`（Unstructured/Basic）→ `chunkDocument` → `extractMetadata`（调用语义分析模型生成上下文摘要、环境标签、实体）→ `embedChunks`（本地向量模型）→ `persistBundle`（Chunk+Embedding+SemanticMetadata+VectorLog）→ Hybrid 检索 | 入库前生成 `SemanticMetadata` JSON，包含 `contextSummary`、`semanticTags`、`envLabels`、`bizEntities` 等字段；向量化全程记录日志。 |
| 需 OCR 的 pdf/image | 上传 → Worker 根据 MIME/扩展名或 `source.mimeType` 判定 → 若 `config.OCR_ENABLED=true`，走 OCRAdapter（本地 PaddleOCR + 检测/识别或外部 API）→ 得到文本/表格/图片 caption 元素 → `chunkDocument`（保留页面/bbox）→ 后续步骤同上 | OCRAdapter 输出 `ParsedElement`，统一数据结构；支持 API/本地 OCR 切换，并将 OCR 细节记录在 VectorLog + `SemanticMetadata.ocrTrace`。 |
| 检索（REST/MCP/Web） | 查询参数包含 `tenantId/libraryId` + 语义标签/环境标签过滤 → HybridRetriever 结合向量+BM25 → 结果按 `semanticTags/envLabels` 聚合/筛选 → Web UI 以 maxkb 风格展示流程状态、模型配置和日志回显 | 检索请求支持 `filters.semanticTags`、`filters.envLabels`、`filters.metadataQuery`（JSONPath）。

## 2. 模块职责

### Worker（apps/worker）
1. **文件分流**：`fetchSource` 根据 MIME/扩展名打标签 `parseStrategy`（text/pdf/image/zip），供 pipeline 选择解析器；超过内存阈值的文件落盘并在 cleanup 中删除。
2. **解析+OCR**：新增 `OcrAdapter`（封装本地 PaddleOCR 或可配置 HTTP API），并在 `createParserFromConfig` 中注入 `OcrAwareParser`（先尝试 Unstructured，失败/无文本时触发 OCR）。
3. **语义元数据**：扩展 `extractMetadata`，对每个 chunk 调用 `SemanticMetadataService`（走大模型 API）生成 `contextSummary`、`semanticTags`、`envLabels`、`bizEntities`、`confidence`。输出写入新的 `chunk.semantic_metadata` JSONB。
4. **向量化 + 日志**：`embedChunks` 在调用 VectorClient 前后记录日志（开始时间、模型、输入长度、dim、耗时、状态、错误），通过新 Repository 写入 `vector_logs` 表；失败自动降级并附带原因。
5. **模型配置读取**：支持多条配置（embedding/tagging/metadata/ocr），按 `modelRole` + tenant/library 选择；缓存并带版本号。

### 数据&API 层
1. **Schema 变更**：
   - `chunks` 新增 `semantic_metadata JSONB`、`env_labels TEXT[]`、`context_summary TEXT`。
   - 新建 `vector_logs`（log_id, chunk_id, doc_id, model_role, model_name, provider, driver(local|remote), status, duration_ms, vector_dim, input_chars, ocr_used, error_message, created_at）。
   - `model_settings` 新增 `model_role`（embedding/tagging/metadata/ocr/rerank）和 `display_name`，支持多条记录。
2. **Repositories**：
   - 扩展 `KnowledgeWriter` 写入 `semantic_metadata` 字段。
   - 新增 `VectorLogRepository`，提供 `appendLog`、`listByDoc`、`listRecent`。
   - `ModelSettingsRepository` 改为 `list(tenantId, libraryId)` + `getByRole` + `upsert` + `delete`。
3. **API 端点**：
   - `/model-settings`: GET 列表、POST 新增、PATCH 更新、DELETE 删除、GET /:role。
   - `/vector-logs`: 支持按 docId/chunkId 分页查询。
   - `/documents/:id/semantic-metadata`: 返回 chunk+semanticMetadata。
   - `/search`: 支持 `filters.semanticTags/envLabels` 并可返回 `semanticMetadata`。

### Web（apps/web）
1. **maxkb 风格流程页**：时间线组件展示 上传→解析→OCR→语义标签→向量化→召回 状态，每个阶段可展开查看日志（vector log、OCR log）。
2. **模型配置中心**：展示模型列表（embedding/tagging/metadata/ocr），可切换/启用、查看健康检测（调用 API 获取模型列表/状态）。
3. **召回界面**：增加语义标签/环境标签过滤器、chunk 语义摘要展示，支持查看向量日志。
4. **向量日志面板**：基于 `/vector-logs` API，可筛选 chunk/doc、查看本地模型 vs API 模型耗时。

### MCP Server & Scripts
- MCP 工具 `kb.search`/`kb.related` 新增 `semanticMetadata` 回传。
- `scripts/` 中新增 `sync-ocr-models.ts`/`sync-embedding-models.ts` 以保证本地模型下载一致。

## 3. 重构 TODO 列表

| 序号 | 模块 | TODO | 说明 | 负责人 | 状态 |
| --- | --- | --- | --- | --- | --- |
| T1 | 数据层 | 设计并落地 `chunks.semantic_metadata`、`vector_logs`、`model_settings.model_role` 的迁移与 Kysely schema | 生成 SQL + repository 适配 | Codex | 待办 |
| T2 | Worker | 引入 `OcrAdapter` + `SemanticMetadataService` + VectorLog instrumentation（含配置加载与缓存） | 需要可插拔 provider、本地模型 fallback、错误隔离 | Codex | 待办 |
| T3 | API | 扩展 `/model-settings`、`/vector-logs`、`/search`、`/documents/:id/metadata` 等端点；暴露模型列表/日志查询 | 更新 routers + repositories + validation | Codex | 待办 |
| T4 | Web | 仿 maxkb 的流程视图、模型配置 UI、日志/语义标签展示 | 重构页面、组件与 API hooks | Codex | 待办 |
| T5 | MCP/工具 | 更新 MCP 工具输出结构 + 提供 CLI/log 查询脚本 | 保障 Agent 能读取语义标签 | Codex | 待办 |
| T6 | 测试与验证 | 搭建 OCR + 语义元数据 + 向量日志的 Vitest/Playwright 覆盖，并撰写 `docs/retrieval.md` 更新 | 包含本地模型 mock + API stubs | Codex | 待办 |

## 4. 验收契约

1. **接口契约**：
   - 上传：保持 `files[]`，增加 `parseStrategy` 推断结果，响应需包含 `pipelineTraceId`。
   - 模型配置：列表返回 `{role, displayName, provider, modelName, baseUrl, hasApiKey, updatedAt}`，可手动切换激活模型。
   - 向量日志：默认按 `createdAt desc` 分页，记录模型、耗时、输入长度、上下文信息。
2. **语义元数据**：每个 chunk 必须有 `contextSummary`（<=240 字）、`semanticTags`（<=5）、`envLabels`（<=3）、`bizEntities`（<=5）和可信度；若无法生成需记录原因。
3. **OCR/解析**：PDF/图片上传后必须产生至少一条 OCR 记录；若 OCR 关闭需在 UI 显示提示。
4. **Web 交互**：maxkb 风格流程包括 6 个阶段，允许查看阶段状态、日志与模型信息；模型列表支持一键切换并立即影响后续任务。
5. **验证**：提供 `bun test` + `bun run scripts/api-smoke.ts` + Playwright 场景，覆盖 doc 与 pdf 流程；在 `.codex/testing.md` 记录执行结果。

## 5. 里程碑

1. **Milestone A**：完成数据层 + Worker 的 OCR/语义/日志改造，可通过 API 验证；预计 3 d。
2. **Milestone B**：API + Web 改造上线，具备 maxkb 流程 UI 与模型切换；预计 3 d。
3. **Milestone C**：完成测试、文档、MCP 更新时间线；预计 2 d。

---
由 Codex 于 2025-11-17 编写。
