# Ingestion Pipeline Guide

> 日期：2025-11-10 执行者：Codex

## 1. 流程概览
1. **上传注册**：`apps/api` 接收文档、计算校验和、写入 `documents`。 
2. **任务入队**：API/脚本将 `IngestionTask` 推到队列。 
3. **Worker 语义流水线**：`apps/worker` 执行 `fetch → preprocess → semanticSegmenter → metadata LLM → embed → persist`，详见下一节。 
4. **结构树写入**：每次索引都会将 LLM 生成的章节树落库，可通过 `/documents/:docId/structure` 读取。 
5. **指标记录**：写入 `kb_ingestion_total`、`kb_ingestion_pipeline_seconds`、`kb_ingestion_errors_total`。 
6. **可观测性**：`/metrics` 搭配 Prometheus/Grafana；前端 Ingestion Dashboard 的实时日志/结构树面板可直接验证。

## 2. 关键实现
- **Shared Schemas**：`@kb/shared-schemas` 提供 `Document`, `Chunk`, `Embedding`, `IngestionTask` 等 Zod 定义。  
- **语义 Pipeline**：`apps/worker/src/pipeline.ts` 的默认阶段如下（每个阶段均可注入自定义实现）：  
  1. **fetchSource**：拉取原文件/缓存；  
  2. **parseDocument**：调用 Unstructured/内置 parser；  
  3. **preprocessRawText**：去除控制字符、空白、页眉页脚；  
  4. **semanticSegmenter（LLM）**：根据语义输出章节树（title/level/content/path），形成结构化 `document_sections`；  
  5. **chunkDocument**：以 LLM 输出为唯一切分依据，禁止退回字数/正则；  
  6. **extractMetadata（LLM）**：为每个 chunk 生成 `title/summary/tags/topics/keywords/entities/parentSectionPath`；  
  7. **embedChunks**：本地 `@xenova/transformers` 生成文本/图片向量，失败视为错误；  
  8. **persistBundle**：写入 `documents`、`chunks`、`document_sections`、`embeddings`、`attachments`、向量库。  
- **向量推理**：`packages/core/src/vector.ts` 的 `VectorClient` 负责本地/远程嵌入与 rerank。  
- **存储接口**：`@kb/data` 模组封装 Postgres/pgvector + Qdrant + MinIO + RabbitMQ，API/Worker/MCP 统一依赖该资料层，无需再使用 InMemory 占位。
- **结构树 API**：`GET /documents/:id/structure`（`apps/api/src/routes.ts`）返回 LLM 构建的章节树，前端 `StructureTree` 组件与 MCP 均可复用。

## 3. 运维脚本
- `ops/scripts/backup.ts`：示范 Postgres/MinIO/Qdrant 备份流程。  
- `ops/scripts/restore.ts`：示范恢复到指定快照目录。  
- `ops/scripts/reindex.ts`：向队列写入重建任务，可配合 Worker 执行。  
执行示例：
```bash
ENV_FILE=.env.example bun run ops/scripts/backup.ts --tenantId=default
```

## 4. 指标与告警
| 指标 | 类型 | 说明 |
| --- | --- | --- |
| `kb_ingestion_total` | counter | Worker 完成的任务数 |
| `kb_ingestion_pipeline_seconds` | histogram | Pipeline 耗时（默认桶：0.5/1/2/5 秒） |
| `kb_ingestion_errors_total` | counter | Pipeline 抛出的异常 |

建议在 Grafana 中建立卡片监视 `kb_ingestion_pipeline_seconds` P95 + `kb_ingestion_errors_total`。

## 5. 验收要点
- 任意上传在 5 秒内完成语义流水线（demo 环境），并能在 `/documents/:id/structure` 看到层级数据。  
- Chunk 必须包含 LLM 元数据：`title/summary/tags/topics/keywords/entities/parentSection`。  
- Vector log 中可看到 `metadata.fallback=false`，确保实际使用本地模型。  
- `/metrics` 路由导出 ingestion 指标，结构树/元数据可在 Web 控制台检视。  
- 备份/恢复脚本 dry-run 输出完整命令并明确 tenant。  

> 若需替换解析/切块/嵌入阶段，可在 `startWorker()` 调用中注入自定义实现，仍沿用此文档流程。
