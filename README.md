# MCP Knowledge Base Monorepo

本项目实现“多模态知识库 + MCP 服务”参考实现，包括 API、Ingestion Worker、MCP Server 及相关工具脚本。以下指南覆盖 Windows（WSL2）与 Linux 环境的安装、配置与启动步骤。

## 目录与模块
- `apps/api`：REST API（上传、搜索、治理，默认暴露 `/metrics`）。  
- `apps/worker`：Ingestion Pipeline（fetch → parse → chunk → metadata → embed → persist）。  
- `apps/mcp`：MCP 工具（`kb.search`、`kb.related`、`kb.preview`）。  
- `packages/core`：向量推理、Hybrid 检索等核心能力。  
- `packages/shared-schemas`：Zod schema（Document/Chunk/Embedding/Task 等）。  
- `packages/data`：Postgres/pgvector + Qdrant + MinIO + RabbitMQ 数据访问与客户端封装。  
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

### 可选：多模态解析/嵌入参数

- `UNSTRUCTURED_API_URL` / `UNSTRUCTURED_API_KEY`：指向 Unstructured/Tika HTTP 服务，Worker 会优先调用以解析 PDF/PPTX/XLSX/图片，失败时回退到内置解析器。
- `TEXT_EMBEDDING_ENDPOINT` / `IMAGE_EMBEDDING_ENDPOINT`：外部向量 API；若同时开启 `LOCAL_EMBEDDING_ENABLED=true`，则可使用 `@xenova/transformers` 在本地加载 `LOCAL_TEXT_MODEL_ID`、`LOCAL_IMAGE_MODEL_ID`（默认 MiniLM + CLIP），并使用 `MODELS_DIR` 作为缓存。
- `MINIO_BUCKET_RAW` / `MINIO_BUCKET_PREVIEW`：原始文档和解析产物（表格 JSON、图片预览）的存储桶，Worker 会自动按照 `tenantId/docId` 生成对象路径并写入 `attachments`。

#### 启用本地嵌入（`LOCAL_EMBEDDING_ENABLED=true`）

1. 在 `.env` 中设置：
   ```ini
   LOCAL_EMBEDDING_ENABLED=true
   LOCAL_TEXT_MODEL_ID=Xenova/all-MiniLM-L6-v2      # 可替换
   LOCAL_IMAGE_MODEL_ID=Xenova/clip-vit-base-patch32
   MODELS_DIR=./models/weights                     # 用于 transformers 缓存
   ```
2. 通过项目已有的模型脚本提前创建缓存目录（可与远程下载共存）：
   ```bash
   ENV_FILE=.env bun run scripts/sync-models.ts     # 已拉取的权重会重复使用
   ```
   首次加载 `@xenova/transformers` 时会自动把模型文件保存到 `MODELS_DIR`；若需离线环境，可先在联网机器执行上述命令并把目录拷贝到目标主机。

#### 准备 MinIO raw/preview 桶（验证附件写入与 Phase 6.2 上传/治理）

1. 启动 MinIO（`docker compose up object`）后，使用 `mc` CLI 连接：
   ```bash
   mc alias set kb-local http://localhost:9000 kb-local kb-local-secret
   ```
2. 根据 `.env` 中配置的桶名创建 raw/preview 桶（默认 `kb-raw`、`kb-preview`）：
   ```bash
   mc mb kb-local/kb-raw
   mc mb kb-local/kb-preview
   ```
3. 为供 Worker/后续 API 使用可选地开启版本或访问策略：
   ```bash
   mc anonymous set download kb-local/kb-preview   # 若需要公共预览
   ```
4. 运行 `ENV_FILE=.env bun run apps/worker/src/main.ts` 并触发一次 ingestion 后，可在 `kb-preview/<tenant>/<docId>/tables|images/` 下看到表格 JSON 与图片附件；Phase 6.2 的上传/治理接口将直接复用这些对象键来提供预览与删除能力。

### Phase 6.2：REST/MCP 扩展速览

- `POST /upload`：multipart 表单上传文档，字段 `file`（必填）+ 可选 `title/tenantId/tags[]`；若缺 `tenantId`，将回退至 `X-Tenant-Id` 头或默认租户，随后写入 MinIO raw bucket 并入队。
- `POST /search`：所有请求会自动注入 `X-Tenant-Id`，filters 支持 `tenantId/docIds/topicLabels/hierarchyPrefix/contentTypes/attachmentTypes/hasAttachments`；返回结果包含 `attachments`、`sourceUri=kb://chunk/<id>`。
- `GET /documents`：根据 `X-Tenant-Id` 或查询参数列出当前租户下的文档。
- `DELETE /documents/:id`：校验 header 与文档租户后，删除 chunks/attachments/raw/preview/Qdrant；若存储支持 `deletePreviewPrefix` 将按 `kb-preview/<tenant>/<docId>/` 前缀批量清理。`POST /documents/:id/reindex` 同样执行租户校验并重新入队。
- `GET /stats`：返回 `{ documents, attachments, chunks, pendingJobs }`，并默认按租户隔离。
- MCP 工具 `kb.search/kb.related/kb.preview` 仍由 `ctx.tenantId` 控制隔离，响应内包含附件列表及 `kb://chunk/*` 溯源 URI，Agent 可直接引用 MinIO object key 生成预览或治理操作。

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
| `ops/scripts/backup.ts` | 使用 `pg_dump`、`mc alias/mirror` 与 `curl` 导出 Postgres/MinIO/Qdrant（默认 dry-run，附 `--execute=true` 时会真正执行命令）。 |
| `ops/scripts/restore.ts` | 以 `psql`、`mc mirror`、`curl` 复原数据，并通过 RabbitMQ HTTP API 触发 reindex（同样支持 `--execute=true`）。 |
| `ops/scripts/reindex.ts` | 直接调用 RabbitMQ HTTP API（`curl`）向 `kb.ingestion` 队列发布 reindex 任务，支持 dry-run / execute。 |
| `scripts/publish-images.ts` | 构建/推送 `kb-api`、`kb-worker`、`kb-mcp` 镜像。 |
| `scripts/rollback-stack.ts` | 依据版本从 Registry 回滚镜像并重启 Compose。 |

所有脚本支持 `ENV_FILE=.env` 与 `--tenantId`、`--registry`、`--version` 等参数，更多描述见 `deploy/docker/README.md` 与 `docs/ingestion.md`。

> Ops 脚本默认以 dry-run 模式运行，可通过 `--execute=true` 触发真正的 `pg_dump`、`psql`、`mc`、`curl` 等命令。例如：

```bash
# Dry-run（仅打印命令）
bun run ops/scripts/backup.ts

# 真正执行，需已安装 pg_dump/mc/curl 且 RabbitMQ Management Plugin 已启用
bun run ops/scripts/backup.ts --execute=true
```

> 需确保本机可用 `pg_dump`、`psql`、`mc`、`curl`，并启用 RabbitMQ Management Plugin（默认监听 `http://localhost:15672`）。可通过 `.env` 中的 `RABBITMQ_HTTP_URL`/`RABBITMQ_HTTP_USER`/`RABBITMQ_HTTP_PASS` 覆盖默认 HTTP 端点与凭证。

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

## 8. 部署计划（建议）
1. **准备依赖**
   - 安装 Bun ≥ 1.3、Docker + Docker Compose、`pg_dump`/`psql`、MinIO `mc` CLI、`curl`，并启用 RabbitMQ Management Plugin（默认 `http://localhost:15672`）。  
   - 复制环境变量示例：`cp .env.example .env`，根据实际部署填写数据库、MinIO、Qdrant、RabbitMQ 及 `RABBITMQ_HTTP_*` 信息。
2. **启动底层服务**
   ```bash
   docker compose up -d db vectordb object redis queue
   ```
   （如需调试日志，可加 `LOG_LEVEL=debug` 或单独启动组件。）
3. **初始化数据库与存储**
   ```bash
   ENV_FILE=.env bun run scripts/run-migrations.ts          # 建表/索引
   ENV_FILE=.env bun run scripts/bootstrap-storage.ts       # 创建 MinIO 桶 + Qdrant 集合
   ENV_FILE=.env HF_TOKEN=hf_xxx bun run scripts/sync-models.ts   # 可选：下载向量/重排/CLIP/OCR 模型
   ```
4. **启动 Worker / API / MCP**
   ```bash
   START_WORKER=true  ENV_FILE=.env bun run apps/worker/src/main.ts
   START_API_SERVER=true ENV_FILE=.env API_TOKEN=dev-token bun run apps/api/src/main.ts
   START_MCP_SERVER=true ENV_FILE=.env bun run apps/mcp/src/main.ts   # 如需独立 MCP 进程
   ```
   也可执行 `docker compose up -d kb-api kb-worker kb-mcp` 使用容器镜像。
5. **验证链路**
   ```bash
   # 注册一个文档（当前实现只记录元数据，同时触发队列任务）
   curl -X POST http://localhost:8080/documents \
     -H "Authorization: Bearer dev-token" \
     -H "Content-Type: application/json" \
     -d '{"docId":"'$RANDOM'","title":"示例合同","tenantId":"default"}'

   # 检索
   curl -X POST http://localhost:8080/search \
     -H "Authorization: Bearer dev-token" \
     -H "Content-Type: application/json" \
     -d '{"query":"付款", "limit":5}'
   ```
   Worker 日志会输出 ingestion 进度，API `/metrics` 可用来观察请求与队列指标。
6. **运维脚本**
   - 备份：`bun run ops/scripts/backup.ts --execute=true`
   - 恢复：`SNAPSHOT_DIR=./backups/default/<timestamp> bun run ops/scripts/restore.ts --execute=true`
   - 重索引：`bun run ops/scripts/reindex.ts --execute=true`
   所有脚本默认 dry-run；需先确认命令输出后再加 `--execute=true` 实际执行。
7. **测试（可选）**
   - `bun test`：运行所有 Bun/Vitest 单测。
   - `bun run scripts/test-matrix.ts`：顺序执行 unit → integration → e2e（需安装 Vitest/Playwright 并设置 `E2E_ENABLED=1`）。

## FAQ
**Q:** 是否提供前端上传界面？  
**A:** 已提供 `apps/web` 示例控制台，支持文档上传、检索测试与标签编辑。若需更完整的 UI，可在此基础上扩展。
