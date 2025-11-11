# E2E Test Instructions

> 日期：2025-11-10 执行者：Codex

## 环境准备
1. `docker compose up -d db vectordb object redis queue`  
2. `ENV_FILE=.env.example bun run scripts/bootstrap-storage.ts`  
3. `ENV_FILE=.env.example bun run scripts/run-migrations.ts`  
4. `START_WORKER=true ENV_FILE=.env.example bun run apps/worker/src/main.ts`  
5. `START_API_SERVER=true ENV_FILE=.env.example API_TOKEN=e2e-token bun run apps/api/src/main.ts`

## 数据准备
- 将示例文档放入 `assets/samples/` 并调用 `/documents` 接口上传元数据。  
- Worker 运行后会自动解析、切块、嵌入并持久化。  
- 验证 `/metrics` 端点是否暴露 `kb_ingestion_*` 指标。

## 运行测试
```bash
E2E_ENABLED=1 API_BASE=http://localhost:8080 API_TOKEN=e2e-token \
  bunx playwright test --config playwright.config.ts
```
- `tests/e2e/knowledge.e2e.ts` 覆盖上传 → 搜索 → MCP 相关查询。
- 若缺少 Playwright，`scripts/test-matrix.ts` 会自动将 e2e 阶段标记为 skipped。

## 结果验证
- Playwright 报告需全部通过。  
- 若出现失败，请收集以下信息：  
  1. `/metrics` 指标快照；  
  2. API/Worker 日志；  
  3. 数据库/对象存储/Scheduler 状态；  
  4. `scripts/backup.ts` 的最近备份（如需要回滚）。
