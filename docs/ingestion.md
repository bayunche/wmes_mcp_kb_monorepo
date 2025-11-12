# Ingestion Pipeline Guide

> 日期：2025-11-10 执行者：Codex

## 1. 流程概览
1. **上传注册**：`apps/api` 接收文档元数据，写入 repository。 
2. **任务入队**：API 或脚本将 `IngestionTask` 发送到队列（Redis/RabbitMQ）。 
3. **Worker 处理**：`apps/worker` 消费任务 → fetch → parse → chunk → metadata → embed → persist。解析阶段优先调用 `UNSTRUCTURED_API_URL` 指向的服务（fallback 为内置文本解析），并将表格/图片拆分为 `Chunk + Attachment`；附件预览写入 `MINIO_BUCKET_PREVIEW`，文本/表格/图片向量则通过外部端点或本地 `@xenova/transformers` 生成。 
4. **指标记录**：每个任务都会写入 `kb_ingestion_total`、`kb_ingestion_pipeline_seconds` 等指标。 
5. **可观测性**：结合 `scripts/deploy-local.sh` 启动 `/metrics`，以 Prometheus/Grafana 进行监控。

## 2. 关键实现
- **Shared Schemas**：`@kb/shared-schemas` 提供 `Document`, `Chunk`, `Embedding`, `IngestionTask` 等 Zod 定义。  
- **Pipeline 实现**：`apps/worker/src/pipeline.ts` 包含默认阶段，可通过依赖注入替换解析/嵌入逻辑。  
- **向量推理**：`packages/core/src/vector.ts` 的 `VectorClient` 负责本地/远程嵌入与 rerank。  
- **存储接口**：`@kb/data` 模组封装 Postgres/pgvector + Qdrant + MinIO + RabbitMQ，API/Worker/MCP 统一依赖该资料层，无需再使用 InMemory 占位。

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
- 任意上传在 5 秒内完成 pipeline（demo 环境）。  
- 失败任务自动计数，可在日志中定位。  
- 备份/恢复脚本 dry-run 输出完整命令并明确 tenant。  
- `/metrics` 路由可导出上述指标，并在 CI 本地测试中验证 `MetricsRegistry`。

> 若需替换解析/切块/嵌入阶段，可在 `startWorker()` 调用中注入自定义实现，仍沿用此文档流程。
