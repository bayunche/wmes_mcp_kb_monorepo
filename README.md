# MCP Knowledge Base Monorepo

> 多模态知识库 + MCP 参考实现，涵盖 API、Ingestion Worker、MCP Server、Web 控制台与一套可复制的部署/运维脚本。

## ✨ Highlights

- **全链路流水线**：支持文档上传 → 解析 → 切块 → 元数据提取 → 向量嵌入 → 持久化 → 检索/MCP 预览。
- **多模态能力**：内置文本/表格/图片附件生成，REST `/mcp/*` 与 MCP Server 同步暴露 `kb.search`、`kb.related`、`kb.preview` 工具。
- **可观测性与治理**：REST `/stats`、`/metrics`，删除/重索引等治理接口与队列治理脚本一应俱全。
- **一键部署脚本**：`scripts/deploy-local.sh` 统一管理 Bun 与 Docker 两种部署模式，10 步内即可落地。
- **脚本化运维**：备份/恢复/重索引/镜像发布/回滚脚本全部可 dry-run，便于在受限环境中预览。

## 📦 Repo Layout

| 路径 | 描述 |
| --- | --- |
| `apps/api` | REST API（上传、搜索、治理、/mcp 代理、Prometheus `/metrics`）。 |
| `apps/worker` | Ingestion Worker：fetch → parse → chunk → metadata → embed → persist。 |
| `apps/mcp` | MCP Server & 工具（`kb.search`、`kb.related`、`kb.preview`）。 |
| `apps/web` | React + Vite 控制台，支持 multipart `/upload`、展示附件并调用 MCP 预览。 |
| `packages/{core,data,shared-schemas,tooling}` | 向量推理、Kysely 数据层、Zod Schema、指标工具。 |
| `scripts/` & `ops/scripts/` | 部署/测试/备份/恢复/镜像管理脚本。 |
| `docs/` | 运行指南（ingestion、retrieval、mcp 等）。 |

## 🧭 Architecture Overview

- **API**：基于 Bun，负责认证、租户隔离、MinIO 写入、队列入栈、搜索+附件聚合、`/mcp/*` 代理、治理端点。
- **Worker**：消费 RabbitMQ 任务，调用解析器（Unstructured/Tika、本地 parser）、chunk factory、VectorClient（可远程 API 或本地 @xenova 模型），生成附件并写入 Postgres/Qdrant/MinIO。
- **MCP Server**：通过 `createMcpServer()` 暴露工具，既可独立运行（`apps/mcp/src/main.ts`），也可由 API 代理。
- **Web 控制台**：演练上传/检索/标签/预览，便于产品和测试人员验证。
- **数据 & 运维**：Kysely + pgvector + Qdrant + MinIO + RabbitMQ，辅以 backup/restore/reindex/publish 镜像脚本。

## 🔧 Tech Stack

- **Runtime**：Bun 1.x + TypeScript、React + Vite（前端）。
- **Data Plane**：Postgres/pgvector、Qdrant、MinIO、RabbitMQ。
- **ML**：HybridRetriever + VectorClient（支持远程 API 或 @xenova/transformers 本地模型）。
- **Validation**：Zod schema（`@kb/shared-schemas`）。
- **Testing**：`bun test`、Vitest、Playwright（通过 `scripts/test-matrix.ts` 编排）。

## 🚀 Quick Start
所有命令均在仓库根目录执行。先确定使用的操作系统，再选择“Docker Compose”或“本地原生（Bun）”方案，然后完成准备 → 初始化 → 启动 → 验证。

### Linux / macOS

#### 使用 Docker Compose
**准备**
- 安装 Docker Engine + docker compose plugin。
- 复制容器环境：`cp .env.docker .env.docker.local`（如需修改端口/密码可编辑该文件）。

**步骤**
1. 安装依赖：`bun install`。
2. 构建镜像：`docker compose build kb-api kb-worker mcp-server`。
3. 一键启动：`./scripts/deploy-local.sh --env-file .env.docker --stack-mode docker --start-apps true`。
   - 或手动执行：`docker compose up -d db vectordb object redis queue` → `docker compose up -d kb-api kb-worker mcp-server`。
4. 继续阅读“🐳 Docker Deployment（6 步）”获取更详细的调优/停止步骤。

**验证**
- 运行 `curl http://localhost:8080/health` 或直接执行下方的 [✅ Smoke Test](#-smoke-test)。
- 如本机缺少 `psql`，可在执行 `deploy-local.sh` 前设置 `PSQL_COMMAND="docker compose exec -T db psql"` 以便脚本在容器内运行迁移。

#### 本地原生（Bun 模式）
**准备**
- Bun ≥ 1.3、`psql`、MinIO `mc`、`curl`。
- 已在本机安装并启动 Postgres、Qdrant、MinIO、Redis、RabbitMQ（端口需与 `.env` 匹配）。

**步骤**
1. `bun install && cp .env.example .env`。
2. `./scripts/deploy-local.sh --env-file .env --stack-mode bun`（脚本会检查依赖、初始化桶/集合、执行迁移、同步模型）。
3. 按“🛠 Local Development（Linux / macOS）”章节的顺序启动 Worker/API/MCP/Web。

**验证**
- 参照 [✅ Smoke Test](#-smoke-test) 发起 /documents → /search → /mcp/preview 请求。

### Windows（纯原生，不依赖 WSL）

#### 使用 Docker Desktop
**准备**
- Windows 10/11 + Docker Desktop（启用 WSL2 引擎即可，但命令在 PowerShell/CMD 中执行）。
- 安装 Windows 版 Bun，用于 `bun install` 与辅助脚本；可在 PowerShell 中运行 `iwr https://bun.sh/install.ps1 -UseBasicParsing | iex`。

**步骤**
1. 切换到仓库根目录并执行：
   ```powershell
   bun install
   Copy-Item .env.example .env -Force
   Copy-Item .env.docker .env.docker.local -Force
   ```
2. 清理旧容器（可选）：`docker compose down --remove-orphans`。
3. 构建镜像：`docker compose build --no-cache kb-api kb-worker mcp-server`。
4. 启动全部服务：`docker compose up -d`。
5. 如需手动运行迁移/存储初始化，可在 PowerShell 中执行：
   ```powershell
   $env:ENV_FILE = ".env.docker"
   docker compose exec -T db psql -U kb -d kb -c "SELECT 1"  # 确认数据库可连接
   docker compose exec kb-api bun run scripts/run-migrations.ts
   docker compose exec kb-api bun run scripts/bootstrap-storage.ts
   ```
6. 查看“🐳 Docker Deployment（6 步）”了解更多运维命令。

**验证**
- 在 PowerShell 中执行 [✅ Smoke Test](#-smoke-test) 中的 curl 命令，或直接访问 `http://localhost:8080/health`。
- 所有 Docker 命令务必在 PowerShell/CMD 中运行，避免 WSL 路径/权限差异。

#### 纯原生（Bun + 手动依赖，无 Docker / WSL）
**前置依赖**
- 安装 Windows 版 Bun：`iwr https://bun.sh/install.ps1 -UseBasicParsing | iex`。
- CLI：`psql`（附带 Postgres 客户端）、MinIO `mc`、`curl`（可用 Windows 10+ 自带 `curl.exe`）。
- 数据/队列服务：Postgres ≥15、Qdrant ≥1.9、MinIO、Redis ≥7、RabbitMQ 3.13。可使用官方 MSI/ZIP（例如 [Postgres](https://www.postgresql.org/download/windows/)、[Redis on Windows](https://redis.io/docs/install/install-redis/install-redis-on-windows/)、[RabbitMQ installer](https://www.rabbitmq.com/docs/install-windows) 等），或在 Docker Desktop 中单独运行这些服务（即便不使用 compose）。
- 确认各服务端口与 `.env` 默认值一致（Postgres 5432、Qdrant 6333、MinIO 9000/9001、Redis 6379、RabbitMQ 5672/15672），可用 `Test-NetConnection localhost -Port 5432` 等命令做健康检查。

**初始化环境**
1. 克隆仓库并在 PowerShell 中执行：
   ```powershell
   bun install
   Copy-Item .env.example .env -Force
   ```
2. 如端口或凭证与默认不同，编辑 `.env` 使其与本地服务保持一致。
3. 运行迁移、存储初始化（确保 $env:ENV_FILE 指向 `.env`）：
   ```powershell
   $env:ENV_FILE = ".env"
   bun run scripts/run-migrations.ts
   bun run scripts/bootstrap-storage.ts
   ```
   若没有安装 `psql`，可手动执行 `psql -d kb -U kb -v ON_ERROR_STOP=1 -f db/migrations/0001_init.sql`。
4. （可选）同步本地模型/权重：`bun run scripts/sync-models.ts`。

**启动服务（可在不同 PowerShell 窗口中执行）**
1. Worker：
   ```powershell
   $env:START_WORKER="true"
   $env:ENV_FILE=".env"
   bun run apps/worker/src/main.ts
   ```
2. API：
   ```powershell
   $env:START_API_SERVER="true"
   $env:ENV_FILE=".env"
   $env:API_TOKEN="dev-token"
   bun run apps/api/src/main.ts
   ```
3. （可选）MCP Server：
   ```powershell
   $env:START_MCP_SERVER="true"
   $env:ENV_FILE=".env"
   bun run apps/mcp/src/main.ts
   ```
4. Web 控制台：
   ```powershell
   cd apps/web
   bun install
   $env:VITE_API_BASE="http://localhost:8080"
   $env:VITE_API_TOKEN="dev-token"
   $env:VITE_PREVIEW_BASE="http://localhost:9000/kb-preview"
   bun x vite dev --host 0.0.0.0 --port 5173
   ```

**验证**
- 在 PowerShell 中执行 [✅ Smoke Test](#-smoke-test)（Windows 自带 curl 即可）。
- 如果 API 仍不可用，先确认五个依赖服务端口均处于 LISTEN 状态，再查看 Worker/API 控制台日志。

## 🛠 Local Development（Bun 模式）

### Linux / macOS
1. `./scripts/deploy-local.sh --env-file .env --stack-mode bun`（启动基础设施 + 桶/集合 + 迁移 + 模型）。
2. `START_WORKER=true ENV_FILE=.env bun run apps/worker/src/main.ts`。
3. `START_API_SERVER=true ENV_FILE=.env API_TOKEN=dev-token bun run apps/api/src/main.ts`。
4. （可选）`START_MCP_SERVER=true ENV_FILE=.env bun run apps/mcp/src/main.ts`。
5. `cd apps/web && bun install && VITE_API_BASE=http://localhost:8080 VITE_API_TOKEN=dev-token bunx vite dev`。
6. 运行 Smoke Test（见下节）。

### Windows（纯原生）
> ⚠️ 请先完成 [Quick Start – Windows 纯原生](#纯原生bun--手动依赖无-docker--wsl) 的“前置依赖 + 初始化”部分，确保 `.env`、迁移与存储均已就绪。以下命令与 Quick Start 一致，仅作为日常开发时的速查。

1. Worker：
   ```powershell
   $env:START_WORKER="true"
   $env:ENV_FILE=".env"
   bun run apps/worker/src/main.ts
   ```
2. API：
   ```powershell
   $env:START_API_SERVER="true"
   $env:ENV_FILE=".env"
   $env:API_TOKEN="dev-token"
   bun run apps/api/src/main.ts
   ```
3. （可选）MCP Server：
   ```powershell
   $env:START_MCP_SERVER="true"
   $env:ENV_FILE=".env"
   bun run apps/mcp/src/main.ts
   ```
4. Web 控制台：
   ```powershell
   cd apps/web
   bun install
   $env:VITE_API_BASE="http://localhost:8080"
   $env:VITE_API_TOKEN="dev-token"
   $env:VITE_PREVIEW_BASE="http://localhost:9000/kb-preview"
   bun x vite dev --host 0.0.0.0 --port 5173
   ```
5. Smoke Test 同上。

## 🐳 Docker Deployment（6 步）

1. `bun install`（确保脚本可运行）。
2. `docker compose build kb-api kb-worker mcp-server`。
3. `./scripts/deploy-local.sh --env-file .env --stack-mode docker --start-apps true`。脚本会自动 `docker compose up -d db vectordb object redis queue kb-api kb-worker mcp-server` 并执行迁移/模型同步。
4. 如需纯手动：`docker compose up -d db vectordb object redis queue` → `docker compose up -d kb-api kb-worker mcp-server`。
5. 访问 `http://localhost:8080/health`、`/metrics`，或使用 Web 控制台/`curl` 验证。
6. 完成后 `docker compose down` 释放资源。

#### Windows（无 WSL）注意事项
- 请在 **PowerShell / CMD** 中执行 Docker 命令，并确保当前目录为仓库根目录：
  ```powershell
  cd D:\code\mcp知识库\wmes_mcp_kb_monorepo
  docker compose down --remove-orphans
  docker compose build --no-cache kb-api kb-worker mcp-server
  docker compose up -d
  ```
- 如果需要运行脚本（如 `scripts/deploy-local.sh`），同样在根目录执行即可。Bun/Vite 的命令可在 PowerShell（使用 Windows 版 Bun）或 WSL 中运行，但 Docker 构建/启动务必在上述环境进行，避免 WSL 的路径和权限限制。

## ✅ Smoke Test

```bash
# 注册文档（会触发 Worker 入栈）
curl -X POST http://localhost:8080/documents \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{"docId":"'$RANDOM'","title":"示例合同","tenantId":"default"}'

# 检索
curl -X POST http://localhost:8080/search \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{"query":"付款","limit":5}'

# MCP 预览
curl -X POST http://localhost:8080/mcp/preview \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{"chunkId":"<search 结果中的 chunkId>"}'
```

## 🧪 Testing & Verification

- `bun test`：运行 Bun 单元测试（API/Worker/MCP 等）。
- `bun run scripts/test-matrix.ts`：按顺序执行 unit → integration → e2e；若缺 Vitest/Playwright，会自动标记 skipped。
- 受限环境下，可参考 `.codex/testing.md`、`verification.md` 记录的最新结果与风险（例如当前 WSL 无法执行 Windows 版 Bun）。

## 🛠 Operations Toolkit

| 脚本 | 说明 |
| --- | --- |
| `scripts/deploy-local.sh` | 统一的部署脚本（支持 bun/docker 模式、可选跳过 bootstrap/模型、自动启动应用）。 |
| `ops/scripts/backup.ts` | `pg_dump` + MinIO `mc` + Qdrant 导出，默认 dry-run。 |
| `ops/scripts/restore.ts` | 通过 `psql`/`mc mirror`/RabbitMQ HTTP API 恢复快照。 |
| `ops/scripts/reindex.ts` | 调用 RabbitMQ HTTP API 触发重索引。 |
| `scripts/publish-images.ts` | 基于 `deploy/docker/Dockerfile.*` 构建/推送 API/Worker/MCP 镜像。 |
| `scripts/rollback-stack.ts` | 根据版本回滚镜像并重启 compose。 |
| `scripts/sync-models.ts` | 下载文本/图片嵌入及 reranker/OCR 模型，支持离线缓存。 |

## 🌐 Web Console

- 路径：`apps/web`。
- 功能：multipart `/upload`、REST & MCP 检索、MCP Related、标签/删除/重索引治理、/stats 卡片与 `/metrics` 文本查看、附件对象键复制/打开链接（可配置 `VITE_PREVIEW_BASE`）。
- 启动：
  ```bash
  cd apps/web
  bun install
  VITE_API_BASE=http://localhost:8080 \
  VITE_API_TOKEN=dev-token \
  VITE_PREVIEW_BASE=http://localhost:9000/kb-preview \
  bunx vite dev --host 0.0.0.0 --port 5173
  ```

## 📚 Further Reading

- `docs/ingestion.md`：上传 → 切块 → 嵌入 → 持久化流程与 bootstrap/storage 脚本说明。
- `docs/retrieval.md`：Hybrid Retriever、向量调优策略。
- `docs/mcp.md`：MCP 工具输入输出、调试方式与 HTTP 代理说明。
- `AGENTS.md`：贡献者/运维协作准则。

## 🤝 Contributing

- 请先阅读 `AGENTS.md` 了解编码/测试/文档规范。
- 所有变更需更新 `.codex/operations-log.md`、`.codex/testing.md`、`verification.md` 等记录文件。
- 欢迎提 Issues 或提交 PR 讨论新的 ingestion/检索/MCP 功能。

## 📄 License
>
> 项目目前未附带 License 文件，如需在生产环境使用请先与仓库维护者确认授权。
