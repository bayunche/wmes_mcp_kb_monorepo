# MCP Knowledge Base Monorepo

本项目实现“多模态知识库 + MCP 服务”参考实现，包括 API、Ingestion Worker、MCP Server 及相关工具脚本。以下指南覆盖 Windows（WSL2）与 Linux 环境的安装、配置与启动步骤。

## 目录与模块
- `apps/api`：REST API（上传、搜索、治理，默认暴露 `/metrics`）。  
- `apps/worker`：Ingestion Pipeline（fetch → parse → chunk → metadata → embed → persist）。  
- `apps/mcp`：MCP 工具（`kb.search`、`kb.related`、`kb.preview`）。  
- `packages/core`：向量推理、Hybrid 检索等核心能力。  
- `packages/shared-schemas`：Zod schema（Document/Chunk/Embedding/Task 等）。  
- `packages/tooling`：Metrics Registry。  
- `ops/scripts`、`scripts/`：备份/恢复/重索引/镜像发布等运维脚本。  
- `docs/`：各子系统的运行指南。

## 1. 前置要求
| 组件 | Linux | Windows（推荐 WSL2） |
| --- | --- | --- |
| Bun >= 1.3 | `curl -fsSL https://bun.sh/install | bash` | 在 WSL2 中执行相同命令 |
| Docker + Compose | `sudo apt install docker.io docker-compose` 并加入 docker 组 | 安装 Docker Desktop，启用 WSL 集成 |
| Node/Bun 依赖 | `bun install` | WSL2 中执行 `bun install` |
| 可选：Playwright/Vitest | `bunx playwright install`、`bunx vitest` | 同上（WSL2 内） |

> Windows 下的所有命令请在 WSL2 终端中执行，以避免路径/权限问题。

## 2. 安装与配置
1. 克隆仓库后执行：
   ```bash
   bun install
   cp .env.example .env
   ```
2. 配置 `.env` 中的数据库、MinIO、Qdrant、JWT、API Token 等参数。  
3. （可选）设置模型下载镜像：`BGE_M3_URL`、`BGE_RERANKER_URL`、`OPENCLIP_URL`。若需要访问 Hugging Face，请设置 `HF_TOKEN`。

## 3. 启动步骤
### 通用
```bash
# 启动基础设施
docker compose up -d db vectordb object redis queue

# 初始化存储与数据库
ENV_FILE=.env bun run scripts/bootstrap-storage.ts
ENV_FILE=.env bun run scripts/run-migrations.ts

# 同步模型资源（可选）
ENV_FILE=.env HF_TOKEN=hf_xxx bun run scripts/sync-models.ts

# 启动 Worker / API / MCP（可使用 docker compose 或 Bun）
docker compose up -d kb-api kb-worker kb-mcp
# 或
START_WORKER=true ENV_FILE=.env bun run apps/worker/src/main.ts
START_API_SERVER=true ENV_FILE=.env API_TOKEN=dev-token bun run apps/api/src/main.ts
```

### 观察与监控
- API `/metrics`：Prometheus 格式，包含 `kb_api_*`、`kb_ingestion_*` 等指标。  
- Worker 日志：默认输出处理的文档/耗时。可接入 ELK/Prometheus 详见 `packages/tooling/src/metrics.ts`。

## 4. 测试矩阵
```bash
bun run scripts/test-matrix.ts
```
- Unit：`bun test`（当前 20 个用例）。  
- Integration/E2E：若环境未安装 Vitest/Playwright，将自动标记为 skipped。配置完成后即可运行 `bunx vitest --runInBand` 与 `bunx playwright test`（详见 `tests/e2e/README.md`）。

## 5. 运维脚本
| 脚本 | 说明 |
| --- | --- |
| `ops/scripts/backup.ts` | 备份 Postgres/MinIO/Qdrant（默认 dry-run）。 |
| `ops/scripts/restore.ts` | 恢复至指定快照目录。 |
| `ops/scripts/reindex.ts` | 将重建任务发送给 Worker。 |
| `scripts/publish-images.ts` | 构建/推送 `kb-api`、`kb-worker`、`kb-mcp` 镜像。 |
| `scripts/rollback-stack.ts` | 依据版本从 Registry 回滚镜像并重启 Compose。 |

所有脚本支持 `ENV_FILE=.env` 与 `--tenantId`、`--registry`、`--version` 等参数，更多描述见 `deploy/docker/README.md` 与 `docs/ingestion.md`。

## 6. 文档索引
- [`docs/ingestion.md`](docs/ingestion.md)：上传→切块→嵌入→持久化流程及脚本。  
- [`docs/retrieval.md`](docs/retrieval.md)：Hybrid Retriever、向量推理与调优建议。  
- [`docs/mcp.md`](docs/mcp.md)：MCP 工具输入输出、调试方式。  
- [`AGENTS.md`](AGENTS.md)：贡献者指南、运维文档清单。

## 7. React 前端（可选）
路径：`apps/web`，基于 React + Vite，提供文档上传、检索测试、标签编辑等简单控制台。
```bash
cd apps/web
bun install
VITE_API_BASE=http://localhost:8080 VITE_API_TOKEN=dev-token bunx vite dev
```
前端调用 REST API，因此在启动前请确保 API/Worker 已运行。

## FAQ
**Q:** 是否提供前端上传界面？  
**A:** 已提供 `apps/web` 示例控制台，支持文档上传、检索测试与标签编辑。若需更完整的 UI，可在此基础上扩展。
