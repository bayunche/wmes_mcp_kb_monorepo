# MCP Knowledge Base Monorepo

> 多模态知识库 + MCP 参考实现，涵盖 API、Ingestion Worker、MCP Server、Web 控制台与一套可复制的部署/运维脚本。

## ✨ Highlights

- **全链路流水线**：支持文档上传 → 文本清洗 → 语义切分 → 元数据提取 → 结构树生成 → 向量嵌入 → 检索/MCP 预览。
- **语义理解管线**：LLM 负责章节分割与 chunk 元数据（标题/摘要/标签/主题/关键词/NER/parent section），`GET /documents/:id/structure` 可直接读取层级树。
- **Office/OCR 双通道**：DOC/DOCX/PPTX 默认走内置 OfficeParser，其余不可直接解析的 doc/ppt/xls 会自动触发 OCR，本地/HTTP OCR Adapter 均可复用。
- **多模态能力**：内置文本/表格/图片附件生成，REST `/mcp/*` 与 MCP Server 同步暴露 `kb.search`、`kb.related`、`kb.preview` 工具。
- **库级治理**：通过 `libraryId` 把多份文档归入同一知识库，检索、MCP 与治理视图均可按库过滤并查看文本块元数据。
- **可观测性与治理**：REST `/stats`、`/metrics`，删除/重索引等治理接口与队列治理脚本一应俱全。
- **一键部署脚本**：`scripts/deploy-local.sh` 统一管理 Bun 与 Docker 两种部署模式，10 步内即可落地。
- **脚本化运维**：备份/恢复/重索引/镜像发布/回滚脚本全部可 dry-run，便于在受限环境中预览。

## 📦 Repo Layout

| 路径 | 描述 |
| --- | --- |
| `apps/api` | REST API（上传、搜索、治理、/mcp 代理、Prometheus `/metrics`）。 |
| `apps/worker` | Ingestion Worker：fetch → parse → chunk → metadata → embed → persist。 |
| `apps/mcp` | MCP Server & 工具（`kb.search`、`kb.related`、`kb.preview`）。 |
| `apps/web` | React + Vite 控制台，支持 multipart `/upload`、块级治理列表、MCP 预览。 |
| `packages/{core,data,shared-schemas,tooling}` | 向量推理、Kysely 数据层、Zod Schema、指标工具。 |
| `scripts/` & `ops/scripts/` | 部署/测试/备份/恢复/镜像管理脚本。 |
| `docs/` | 运行指南（ingestion、retrieval、mcp 等）。 |

## 🧭 Architecture Overview

- **API**：基于 Bun，负责认证、租户隔离、MinIO 写入、队列入栈、搜索+附件聚合、`/mcp/*` 代理、治理端点。
- **Worker**：消费 RabbitMQ 任务，执行“fetch → preprocess → semanticSegmenter（LLM）→ metadata（LLM）→ embed → persist”，生成结构树 (`document_sections`)、语义 chunk 与附件。
- **MCP Server**：通过 `createMcpServer()` 暴露工具，既可独立运行（`apps/mcp/src/main.ts`），也可由 API 代理。
- **Web 控制台**：演练上传/检索/标签/预览，便于产品和测试人员验证。
- **数据 & 运维**：Kysely + pgvector + Qdrant + MinIO + RabbitMQ，辅以 backup/restore/reindex/publish 镜像脚本。

## 🔧 Tech Stack

- **Runtime**：Bun 1.x + TypeScript、React + Vite（前端）。
- **Data Plane**：Postgres/pgvector、Qdrant、MinIO、RabbitMQ。
- **ML**：HybridRetriever + VectorClient（文本向量强制走 @xenova/transformers 本地模型，rerank 可选远程）。
- **Validation**：Zod schema（`@kb/shared-schemas`）。
- **Testing**：`bun test`、Vitest、Playwright（通过 `scripts/test-matrix.ts` 编排）。

## 🚀 Quick Start

所有命令均在仓库根目录执行。先确定使用的操作系统，再选择“Docker Compose”或“本地原生（Bun）”方案，然后完成准备 → 初始化 → 启动 → 验证。

> ℹ️ 若前端与 API 在不同端口运行（如 <http://localhost:5173> 访问 <http://localhost:8080），可通过环境变量> `CORS_ALLOWED_ORIGINS` 配置允许的 Origin，默认已包含 `http://localhost:5173`。值为逗号分隔列表，示例：`CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173`。

> 📚 库隔离：所有文档/文本块都带有 `libraryId`。请在 `.env` 中设置 `DEFAULT_LIBRARY_ID` 并在前端 `.env`（或运行 `bun dev` 前的环境变量）配置 `VITE_LIBRARY_ID`，确保 API、Worker、Web 共用同一知识库；一个库可以包含多个文件，但检索和治理均按文本块粒度执行。

> ⚠️ 向量化必须使用本地模型：`.env*` 中的 `LOCAL_EMBEDDING_ENABLED` 默认开启，且需指定 `LOCAL_TEXT_MODEL_ID`（例如 `Xenova/all-MiniLM-L6-v2`）。若禁用该配置，Worker 会直接报错并停止，以确保“向量用本地模型”这一要求得以强制执行。
>
> 🧠 混合召回默认启用本地 Rerank：未配置 `.env` 时，Worker 会自动读取 `MODELS_DIR` 中的 bge-m3（embedding）、bge-reranker（rerank）、OpenCLIP（image）等模型；如需覆盖，可在 `.env*` 中设置 `LOCAL_*_MODEL_ID` 或通过 Web 控制台「本地模型管理」直接下载/替换。
>
> 📁 本地模型目录结构：所有模型按角色分别存放在 `MODELS_DIR/<role>/`（`text/`、`rerank/`、`image/`、`ocr/` 等），`scripts/sync-models.ts` 与 Web 控制台都会将文件下载到对应文件夹，并可在同一页面为各角色快速选择本地模型。
>
> 👁️ OCR：Compose 内置 `paddle-ocr` 服务（默认 `http://localhost:8000/ocr`），Worker 已在 `.env.docker` 中指向 `http://paddle-ocr:8000/ocr`（`OCR_MODE=http`、`OCR_ENABLED=true`）。如关闭 OCR，请修改环境变量。

### Linux / macOS

#### 使用 Docker Compose

**准备**

- 安装 Docker Engine + docker compose plugin。
- 复制容器环境：`cp .env.docker .env.docker.local`（如需修改端口/密码可编辑该文件）。

**步骤**

1. 安装依赖：`bun install`。
2. 构建镜像：`docker compose build kb-api kb-worker kb-mcp paddle-ocr`。
3. 一键启动：`./scripts/deploy-local.sh --env-file .env.docker --stack-mode docker --start-apps true`。
   - 或手动执行：`docker compose up -d db vectordb object redis queue` → `docker compose up -d kb-api kb-worker kb-mcp paddle-ocr`。
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
- （可选）PaddleOCR：若希望 Worker 完全离线运行 OCR，请执行 `cd paddle && docker compose up -d --build` 启动仓库内 `/paddle` 示例服务，并在 `.env` 中将 `OCR_MODE=http`、`OCR_API_URL=http://localhost:8000/ocr`（详情见 [PaddleOCR 本地部署（Docker 官方镜像）](#paddleocr-本地部署docker-官方镜像)）。
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
   bun x vite dev --host 0.0.0.0 --port 5173  # 或在仓库根执行 `bun run web`
   ```

**验证**

- 在 PowerShell 中执行 [✅ Smoke Test](#-smoke-test)（Windows 自带 curl 即可）。
- 如果 API 仍不可用，先确认五个依赖服务端口均处于 LISTEN 状态，再查看 Worker/API 控制台日志。

## 🛠 Local Development（Bun 模式）

> 💡 `bun dev` 会同时启动 Worker / API / MCP / Web（等价于分别执行以下命令），前提是依赖服务与 `.env` 已按 Quick Start 配置好。若需要单独调试某个组件，可参考下方分步指令。

> 🌐 前端 Vite Dev Server 默认会将 `/documents`、`/search`、`/mcp`、`/metrics` 等 API 请求代理到 `VITE_PROXY_TARGET`（默认 `http://localhost:8080`），避免跨域。如果后端端口不同，可在运行 `bun dev` 前设置 `VITE_PROXY_TARGET=http://your-api:port`。

> 🎯 Web 控制台（`bun run web`）已划分为多个页面：
>
>- 入库 & 治理：上传文档、查看队列/统计
>- 文档：列表 / 详情 / 标签编辑
>- 检索：Hybrid Search + 预览
>- MCP & 指标：MCP 工具测试和 Prometheus 输出

#### 常用启动命令

| 模块 | POSIX（bash/zsh） | Windows PowerShell |
| --- | --- | --- |
| Worker | `START_WORKER=true ENV_FILE=.env bun run apps/worker/src/main.ts` | `$env:START_WORKER="true"; $env:ENV_FILE=".env"; bun run apps/worker/src/main.ts` |
| API | `START_API_SERVER=true ENV_FILE=.env API_TOKEN=dev-token bun run apps/api/src/main.ts` | `$env:START_API_SERVER="true"; $env:ENV_FILE=".env"; $env:API_TOKEN="dev-token"; bun run apps/api/src/main.ts` |
| MCP Server | `START_MCP_SERVER=true ENV_FILE=.env bun run apps/mcp/src/main.ts` | `$env:START_MCP_SERVER="true"; $env:ENV_FILE=".env"; bun run apps/mcp/src/main.ts` |
| Web 控制台 | `cd apps/web && bun install && VITE_API_BASE=... VITE_API_TOKEN=... bunx vite dev` 或 `bun run web` | `cd apps/web; bun install; $env:VITE_API_BASE="http://localhost:8080"; $env:VITE_API_TOKEN="dev-token"; $env:VITE_PREVIEW_BASE="http://localhost:9000/kb-preview"; bun x vite dev --host 0.0.0.0 --port 5173` 或 `bun run web` |

**大文件上传提示**：

- `API_MAX_BODY_MB`（默认 1024）控制 Bun API 端口允许的最大请求体，确保 ≥ 上传文件大小。
- `API_UPLOAD_STREAM_THRESHOLD_MB`（默认 256）用于决定何时将上传内容落盘后再写入 MinIO，避免一次性在内存中缓存超大 `File`。
- 500MB 级别文件建议配合这两个变量，并保证 MinIO/磁盘有足够空间（临时目录 `tmp/kb-upload-*` 会在上传结束后清理）。

### Linux / macOS

1. `./scripts/deploy-local.sh --env-file .env --stack-mode bun`（启动基础设施 + 桶/集合 + 迁移 + 模型）。
2. `START_WORKER=true ENV_FILE=.env bun run apps/worker/src/main.ts`。
3. `START_API_SERVER=true ENV_FILE=.env API_TOKEN=dev-token bun run apps/api/src/main.ts`。
4. （可选）`START_MCP_SERVER=true ENV_FILE=.env bun run apps/mcp/src/main.ts`。
5. `cd apps/web && bun install && VITE_API_BASE=http://localhost:8080 VITE_API_TOKEN=dev-token bunx vite dev`（或仓库根运行 `bun run web`）。
6. 运行 Smoke Test（见下节）。

### Windows（纯原生）
>
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

### PaddleOCR 本地部署（Docker 官方镜像）

> 仓库根目录自带 `/paddle` 目录（Dockerfile + server.py + docker-compose.yml），内部镜像仍基于官方 `paddlepaddle/paddle`，但已经封装好 FastAPI `/ocr` 服务。推荐直接使用该 compose 以避免在宿主机重复执行 `docker run`。

1. **启动服务（默认暴露 `http://localhost:8000`）**：

   ```bash
   cd paddle
   docker compose up -d --build
   ```

   - `docker-compose` 会构建 `paddle/Dockerfile`，并将共享内存设置为 8GB，适合 CPU 环境。
   - 如需修改端口/卷名，可直接编辑 `paddle/docker-compose.yml`。

2. **验证容器**：

   ```bash
   curl http://localhost:8000/health
   curl -X POST http://localhost:8000/ocr \
     -F "file=@assets/samples/demo.png" \
     -F "language=chi_sim"
   ```

   若返回 `{"result":[...]}`，说明服务可用。使用 `docker compose logs -f paddleocr` 可实时查看 OCR 输出。

3. **配置 `.env`（Worker 走 HTTP 模式）**：

   ```ini
   OCR_ENABLED=true
   OCR_MODE=http
   OCR_LANG=chi_sim
   OCR_API_URL=http://localhost:8000/ocr
   # OCR_API_KEY=           # 若你在 server.py 中增加鉴权，可在此填入 Bearer Token
   ```

   - 在与 Worker 同一 Docker 网络内，可把 `OCR_API_URL` 改成 `http://paddleocr:8000/ocr`（paddle 服务名）。
   - Worker 会在 `OCR_MODE=http` 下由 `apps/worker/src/worker.ts` 注入 `HttpOcrAdapter`，并通过 `packages/core/src/ocr.ts` 以 `multipart/form-data` 发送 `file`、`language`（以及 `response_format=json`）字段。

4. **重启 Worker**：

   ```bash
   bun run scripts/run-migrations.ts
   START_WORKER=true ENV_FILE=.env bun run apps/worker/src/main.ts
   ```

   上传 PDF/图片时会执行：写入临时文件 → 调用 `/ocr` → 将 JSON 解析为 `ParsedElement[]` → 自适应切块 → 本地向量化。

5. **关闭/重启服务**：

   ```bash
   docker compose restart paddleocr   # 仅重启 OCR 容器
   docker compose down                # 需要完全停止时执行
   ```

### PaddleOCR Docker 服务（请按需部署）

> 若需在其他主机或集群中运行，可同样复用 `/paddle` 目录构建镜像，然后长期以 HTTP 服务形式对外暴露。只要保持 POST `/ocr` 接口与 JSON 返回即可被 Worker 识别。

```bash
# 构建镜像（在仓库根目录执行）
docker build -t local/paddle-ocr ./paddle

# 在任意服务器运行（示例映射 9009 -> 8000）
docker run -d --name paddle-ocr -p 9009:8000 \
  -v /srv/paddle-ocr-data:/data \
  local/paddle-ocr
```

- 需要 GPU、代理或额外依赖时，可在 `paddle/Dockerfile` 中自行扩展。
- 启动完成后，使用 `curl -X POST http://<host>:<port>/ocr -F "file=@..." -F "language=chi_sim"` 验证，再在 `.env` 中设置 `OCR_MODE=http`、`OCR_API_URL=http://<host>:<port>/ocr`。
- 如果希望放在已有 compose / k8s 中，只需把 `paddle` 目录复制到目标环境并按需调整。

### 已有 Docker OCR 服务（HTTP 模式）

> 如果你已经维护了自定义 PaddleOCR 服务，只要它接受 `multipart/form-data`（字段 `file`、`language`）并返回 PaddleOCR 风格的 JSON 数组/对象，即可直接与 Worker 对接。

1. **确认契约**：

   ```bash
   curl -X POST http://localhost:9009/ocr \
     -F "file=@assets/samples/demo.png" \
     -F "language=chi_sim"
   ```

   服务需要返回如下结构之一：

   ```json
   {"result":[{"text":"示例内容","score":0.99}]}
   ```

   或

   ```json
   [
     {"text":"示例内容","page":1}
   ]
   ```

2. **配置 `.env` 为 HTTP 模式**：

   ```ini
   OCR_MODE=http
   OCR_LANG=chi_sim
   OCR_API_URL=http://localhost:9009/ocr
   OCR_API_KEY=           # 如服务需要 Bearer Token，可在此填写
   ```

   Worker 会自动附加 `Authorization: Bearer ...`，并通过 `packages/core/src/ocr.ts` 的 `normalizeOcrPayload` 解析上述返回。

3. **重启 Worker**：

   ```bash
   bun run scripts/run-migrations.ts
   START_WORKER=true ENV_FILE=.env bun run apps/worker/src/main.ts
   ```

   若服务与你的 kb-worker 在同一 compose 网络，可用容器名（例如 `http://paddleocr:8000/ocr`）替代 localhost，以避免端口映射。

## 🧪 Testing & Verification

- `bun test`：运行 Bun 单元测试（API/Worker/MCP 等）。
- `bun run scripts/test-matrix.ts`：按顺序执行 unit → integration → e2e；若缺 Vitest/Playwright，会自动标记 skipped。
- `bun run scripts/api-smoke.ts`：在已有 API 服务上执行端到端接口巡检，可通过 `SMOKE_API_BASE`、`SMOKE_API_TOKEN`、`SMOKE_TENANT` 环境变量覆盖目标。
- API / Worker / MCP 日志：运行时分别写入 `logs/<env>/{api|worker|mcp}.log`，默认目录 `logs/dev`（或 `logs/prod`）；可用 `LOG_DIR`、`LOG_ENV`、`LOG_MAX_BYTES` 自定义路径与 1MB 轮转阈值。
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
- 功能：multipart `/upload`、REST & MCP 检索、MCP Related、标签/删除/重索引治理、流程概览（`/stats` + VectorLog 面板）、/model-settings 列表 + 目录回显、附件对象键复制/打开链接（可配置 `VITE_PREVIEW_BASE`）。
- 启动：

  ```bash
  cd apps/web
  bun install
  VITE_API_BASE=http://localhost:8080 \
  VITE_API_TOKEN=dev-token \
  VITE_PREVIEW_BASE=http://localhost:9000/kb-preview \
  bunx vite dev --host 0.0.0.0 --port 5173
  ```

- 模型配置 API：`GET /model-settings/list` 按库返回已保存配置，`GET /model-settings/catalog` 返回可用 provider/model 列表，前端页面可直接加载/套用。
- 语义元数据生成需要为每个租户/库配置 metadata 角色模型（可选 local/remote）；若未设置，Worker 会记录 warning 并跳过该阶段，请在 Web 控制台「模型设置」中至少写入一条 metadata 配置。

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

### PaddleOCR Docker 服务（参考部署示例）

> 如果你只需要一个可复制粘贴的命令在其他主机上拉起服务，可以直接复用 `/paddle` 目录构建镜像：

```bash
docker build -t local/paddle-ocr ./paddle
docker run -d --name paddle-ocr -p 9009:8000 local/paddle-ocr
```

```powershell
docker build -t local/paddle-ocr ./paddle
docker run -d --name paddle-ocr -p 9009:8000 local/paddle-ocr
```

验证：`curl -X POST http://localhost:9009/ocr -F "file=@assets/samples/demo.png" -F "language=chi_sim"` 应返回 JSON 数组/对象。随后在 `.env` 中设置：

```ini
OCR_MODE=http
OCR_LANG=chi_sim
OCR_API_URL=http://localhost:9009/ocr
```

Worker 即会使用 HttpOcrAdapter 调用此服务。
