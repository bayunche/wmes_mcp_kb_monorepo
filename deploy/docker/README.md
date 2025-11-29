# Docker Deployment Guide

## 服务概览
| 服务 | 端口 | 说明 |
| --- | --- | --- |
| db | 5432 | Postgres + pgvector |
| vectordb | 6333 | Qdrant |
| object | 9000/9001 | MinIO |
| redis | 6379 | 队列（可替换为 RabbitMQ） |
| queue | 5672/15672 | RabbitMQ（如需） |
| kb-api | 8080 | REST API |
| kb-worker | - | Ingestion Worker |
| kb-mcp | 9090 | MCP Server |
| paddle-ocr | 8000 | PaddleOCR HTTP 服务（/ocr），供 worker OCR fallback 使用 |

## 启动与停止
### 推荐：脚本一键部署
```bash
docker compose build kb-api kb-worker kb-mcp
./scripts/deploy-local.sh --env-file .env --stack-mode docker --start-apps true
```
脚本会拉起 db/vectordb/object/redis/queue，执行 MinIO/Qdrant/Migration/模型同步，并 `docker compose up -d kb-api kb-worker kb-mcp`。

### 手动模式
```bash
docker compose up -d db vectordb object redis queue
docker compose up -d kb-api kb-worker kb-mcp paddle-ocr
```
完成验证后运行 `docker compose down` 释放资源。默认会加载 `.env.docker` 以指向容器网络下的服务地址；如需调整可复制为 `.env.docker.local`。

### OCR 服务说明
- PaddleOCR 已集成到主 compose，默认暴露 `http://localhost:8000/ocr`，worker 通过 `OCR_API_URL=http://paddle-ocr:8000/ocr`、`OCR_MODE=http` 使用。
- 若需要 GPU，请修改 `paddle/Dockerfile` 或 compose 的设备配置；CPU 亦可运行但速度较慢。

## 镜像发布
使用 `scripts/publish-images.ts`：
```bash
# dry-run 构建
bun run scripts/publish-images.ts --registry=kb-local --version=2025-11-10

# 推送到自定义 registry
bun run scripts/publish-images.ts --registry=registry.example.com/kb --version=2025-11-10 --push=true
```

## 回滚策略
1. 确定需要回滚的版本（例如 2025-11-10）。  
2. 执行：
```bash
bun run scripts/rollback-stack.ts --version=2025-11-10 --registry=registry.example.com/kb
```
脚本将 `docker compose down` → `docker pull` 目标版本 → `docker compose up -d`。

## 监控与指标
API 默认在 `/metrics` 暴露 Prometheus 指标，Worker 会写入 `kb_ingestion_*`。  
建议将 Prometheus/Grafana 添加到 compose，并导入自定义 dashboard（参考 `packages/tooling/src/metrics.ts`）。
