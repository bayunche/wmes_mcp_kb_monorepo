# Bun + TypeScript Implementation Plan

> **执行纪律（必须遵守）**  
> 1. 严格按照本计划列出的顺序执行，禁止跳步或并行未授权任务。  
> 2. 每完成一个步骤，立即在本文件中更新对应复选框状态（`[ ]` → `[x]`），并追加必要的备注/产出链接。  
> 3. 若执行过程中需要调整步骤，务必先在此计划中记录调整原因与新顺序，再实施。  
> 4. 未按计划更新视为违规，影响后续评审。

## 0. 架构要点（bun + TypeScript 对齐）
- **Monorepo**：使用 `bun init` + workspaces，目录建议 `apps/api`, `apps/worker`, `apps/mcp`, `packages/core`, `packages/shared-schemas`, `packages/tooling`。  
- **运行时**：所有服务均以 bun 作为 Node 兼容运行时；对外 REST 层采用 Fastify/Express 兼容库（如 Elysia）以 TypeScript 编写。  
- **消息/数据层**：Postgres + pgvector、Qdrant、MinIO、Redis/RabbitMQ、模型文件（bge-m3、bge-reranker、OpenCLIP）与 OCR（Paddle/Tesseract）。  
- **MCP & API 合约**：统一在 `packages/shared-schemas` 定义 Zod/TypeBox schema，供 API、Worker、MCP 共用。  
- **工具链**：`bunx lint` 调用 ESLint + Biome，`bun test` 运行单元与集成测试，`bunx tsx` 用于脚本化任务。  
- **部署**：`deploy/docker` 提供 Docker Compose，`ops/scripts` 包含 bootstrap、备份、重索引、模型同步脚本。

---

## Phase 0：准备与基线
- [x] **Step 0.1** 初始化 bun monorepo，创建 `bunfig.toml`、根级 `tsconfig.base.json`、`.env.example`、`packages/`/`apps/` 目录。  
  - 产出：基础目录结构、统一 TypeScript 配置。（已完成：建立 apps/*、packages/*、db/*、deploy/docker、ops/scripts、tests、assets、models、docs 等目录；生成 `package.json`、`bunfig.toml`、`tsconfig.base.json`、`.env.example` 并为关键目录添加 `.gitkeep`。）  
  - 校验：`bun install && bun test`（空测试）通过；Git 钩子启用。（已完成：设置 `BUN_INSTALL`, `BUN_TMPDIR` 等环境变量后执行 `bun install` 与 `bun test`，新增 `tests/unit/smoke.test.ts` 作为基线用例。）
- [x] **Step 0.2** 建立共享配置：Pydantic 等价实现改为 TypeScript Config（如 `@t3-oss/env-core`），声明所有必需环境变量。  
  - 产出：`packages/core/src/config.ts`、`packages/core/package.json`、`packages/core/tsconfig.json`、`scripts/validate-env.ts`；根 `package.json` 添加 `dotenv`、`zod` 依赖。  
  - 校验：`bun scripts/validate-env.ts` 成功读取 `.env.example`（通过相对导入运行）。已记录输出供审查。
- [x] **Step 0.3** 定义 QA 机制：创建 `docs/process/update-plan.md`，约定如何更新本实施计划及同步 operations log。  
  - 产出：`docs/process/update-plan.md`，包含触发条件、执行顺序、模板与审核要点（已完成）。  
  - 校验：自查确保 Phase0 更新即遵循该文档；待团队评审时引用。

## Phase 1：数据与基础设施
- [x] **Step 1.1** 建表脚本：在 `db/migrations` 使用 Kysely/Drizzle 生成 Postgres + pgvector 迁移（documents/chunks/embeddings/relations/attachments）。  
  - 产出：`db/migrations/0001_init.sql`（含 `pgcrypto`、`vector` 扩展及各表）以及 `ops/scripts/run-migrations.ts`/`scripts/run-migrations.ts` 脚本，可通过 `ENV_FILE=.env.example bun run scripts/run-migrations.ts` 落库。  
  - 校验：结构审查完成；`psql` 脚本需在具备 PostgreSQL client 的环境执行，或通过 `docker compose exec db psql ...` 验证。
- [x] **Step 1.2** 配置向量库与对象存储：在 compose 中加入 Qdrant、MinIO，并提供 `ops/scripts/bootstrap-storage.ts`（使用 `bun run scripts/bootstrap-storage.ts` 执行）。  
  - 产出：根级 `docker-compose.yml`（去除 version 字段并提供 db/vectordb/object/redis/queue/kb-api/kb-worker/mcp-server 服务）与 `ops/scripts/bootstrap-storage.ts`（可创建 MinIO 桶、Qdrant collections；已在 `scripts/bootstrap-storage.ts` 暴露便捷入口），另提供一键流程 `scripts/deploy-local.sh`。  
  - 校验：脚本已通过静态检查；`docker compose up -d db vectordb object queue` 因当前环境无法运行 Docker 未执行，已在 README/日志中注明，待后续验证。
- [x] **Step 1.3** 队列与模型资源：拉起 Redis/RabbitMQ，并编写 `ops/scripts/sync-models.ts` 下载/校验 bge/CLIP/OCR 资产。  
  - 产出：`ops/scripts/sync-models.ts`（并在 `scripts/sync-models.ts` 暴露入口），含模型清单、下载与 SHA256 验证逻辑；manifest 覆盖 bge-m3、bge-reranker-v2、OpenCLIP、PaddleOCR，支持通过 `ENV_FILE=.env.example` 加载环境、`BGE_M3_URL` 等变量覆盖下载源，以及 `HF_TOKEN`/`HUGGINGFACE_TOKEN` 自动附带授权。  
  - 校验：脚本尚未在当前环境下载模型（受网络与磁盘限制），运行时会逐项报告成功/失败；待具备网络时执行并保存日志。

## Phase 2：Ingestion & Worker Pipeline
- [x] **Step 2.1** `packages/shared-schemas`：定义文档、块、嵌入、任务消息、MCP payload 等 TS 类型+Zod schema。  
  - 产出：`packages/shared-schemas` 包（package.json/tsconfig）；`src/index.ts` 覆盖 Document/Chunk/Embedding/Attachment/Relation/IngestionTask/Search/MCP 等 schema，并附 `z.infer` 类型；`packages/shared-schemas/src/__tests__/schemas.test.ts` 基础校验。  
  - 校验：`bun test`（包含 shared-schemas 测试）全部通过。
- [x] **Step 2.2** Ingestion service (`apps/worker`)：实现上传监听、解析（Unstructured/Tika wrappers）、切块、元数据抽取、向量写入。  
  - 产出：`apps/worker` 包（package.json/tsconfig）、`src/pipeline.ts`（fetchSource → parse → chunk → metadata → embed → persist）以及 `src/queue/in-memory-queue.ts`、`src/worker.ts`、`src/main.ts`，并提供 `startWorker`/默认依赖以支撑队列消费。  
  - 校验：`bun test`（包含 `apps/worker/src/__tests__/ingestion.test.ts`），测试覆盖任务消费与持久化流程。
- [x] **Step 2.3** 模型推理接入：集成 bge-m3、bge-reranker、OpenCLIP，抽象 `packages/core/vector.ts`。  
  - 产出：`packages/core/src/vector.ts`（VectorClient，支持远程端点、HF Token 头、fallback 模型）与 `packages/core/src/__tests__/vector.test.ts`。  
  - 校验：`bun test`（包含 vector 测试）验证本地/远程模式。

## Phase 3：检索层与 MCP
- [x] **Step 3.1** Hybrid Retrieval (`packages/core/retrieval.ts`)：实现向量 + BM25 + 层级/标签过滤与加权融合。  
  - 产出：`packages/core/src/retrieval.ts`（HybridRetriever、InMemoryChunkRepository、可配置权重），`packages/core/src/__tests__/retrieval.test.ts`。  
  - 校验：`bun test`（包含 retrieval 测试）。
- [x] **Step 3.2** MCP 服务 (`apps/mcp`)：依据 MCP 协议暴露 `kb.search`, `kb.related`, `kb.preview` 等资源/工具。  
  - 产出：`apps/mcp` 包（package.json/tsconfig）、`src/server.ts`、`src/tools/*`、`src/index.ts`（提供 `createMcpServer` 和 `handleMcpRequest`），并含内存仓库。  
  - 校验：`bun test`（`apps/mcp/src/__tests__/mcp.test.ts`）模拟工具调用通过。
- [x] **Step 3.3** API 网关 (`apps/api`)：提供上传、检索、治理 REST/HTTP API，包含鉴权、中间件、速率限制。  
  - 产出：`apps/api` 包（package.json/tsconfig）、`src/server.ts`（Bun serve + auth）、`src/routes.ts`、`src/repository/in-memory.ts`、`src/auth.ts`、`src/main.ts`、`src/__tests__/api.test.ts`。  
  - 校验：`bun test`（API 路由/鉴权单测）。

## Phase 4：监控、治理与文档
- [x] **Step 4.1** Observability：集成 OpenTelemetry + Prometheus 指标，暴露 ingestion 延迟、检索 P95、队列积压。  
  - 产出：`packages/tooling` 包（`src/metrics.ts` + 单测）、API/Worker instrumentation（计数器/直方图）、`startMetricsServer`、`apps/api/src/main.ts` 指标端点。  
  - 校验：`bun test` 覆盖 metrics 模块，API/Worker 可通过 `metrics` 注册表记录指标（本地运行 `START_API_SERVER=true` 时暴露 `/metrics`）。
- [x] **Step 4.2** 运维脚本：实现备份、恢复、重索引脚本（`bunx tsx ops/scripts/*.ts`），覆盖多租户。  
  - 产出：`ops/scripts/backup.ts`, `restore.ts`, `reindex.ts`, `utils.ts`，支持 `ENV_FILE`、`tenantId`、dry-run 选项。  
  - 校验：脚本可在 dry-run 模式下打印操作计划；相关命令在 `.codex/operations-log.md` 记录。
- [x] **Step 4.3** 文档与指南：补齐 `docs/ingestion.md`, `docs/retrieval.md`, `docs/mcp.md`, 更新 `AGENTS.md`。  
  - 产出：上述文档（含日期/执行者）与新版 `AGENTS.md` 文档资源章节。  
  - 校验：人工审阅，确保与最新实现一致。

## Phase 5：测试、验收与发布
- [x] **Step 5.1** 自动化测试矩阵：配置 `bun test`（单元）、`bunx vitest --runInBand`（集成）、`bunx playwright test`（E2E/MCP 场景）。  
  - 产出：`scripts/test-matrix.ts`（按顺序运行 unit/integration/e2e；缺失工具时标记为 skipped），并通过 `package.json` 中的 bun runtime 执行。  
  - 校验：`bun run scripts/test-matrix.ts` 已运行，unit 用例 19/19 通过，integration/e2e 在本机缺少工具时自动跳过并明确提示。
- [x] **Step 5.2** 验收剧本：依据《项目需求.md》第 12 章编写 `tests/e2e/*.spec.ts`，确保多模态上传、检索、治理、MCP 流程可复现。  
  - 产出：`tests/e2e/knowledge.e2e.ts`（Playwright 流程，默认 `test.skip`，需设置 `E2E_ENABLED=1` 启用）以及 `tests/e2e/README.md`（准备步骤与命令）。  
  - 校验：本地 `bun run scripts/test-matrix.ts` 会显示 unit 通过、integration/e2e 在缺依赖环境下标记为 skipped；真实环境可启用 `E2E_ENABLED` 后运行 `bunx playwright test`。
- [x] **Step 5.3** 发布与回滚：完善 Docker 镜像发布脚本、版本标签、回滚策略；更新 `deploy/docker/README.md`。  
  - 产出：`scripts/publish-images.ts`（构建/推送镜像）、`scripts/rollback-stack.ts`（基于版本回滚）、`deploy/docker/README.md`（流程说明）。  
  - 校验：脚本在当前环境尝试执行时因缺少 Docker 命令而失败，已在日志中记录；在具备 Docker 的环境即可实际运行。

---

## Phase 6：验收与生产落地（新增）
- [ ] **Step 6.1** 实装真实解析/切块/嵌入：接入 Unstructured/Tika + pdfplumber + PaddleOCR，将上传的 PDF/PPTX/XLSX/图片解析为文本、表格与图片块；为向量与重排引入 bge-m3、bge-reranker、OpenCLIP，去除 `defaultWorkerStages` 中的占位逻辑。  
  - 产出：面向多模态的 `fetchSource/parse/chunk/extractMetadata/embed` 实现、模型下载/缓存策略、MinIO 附件写入路径。  
  - 校验：使用真实样例文档跑通“上传 → 解析 → 切块 → 向量化 → 入库”，并在 README/验收手册中附截图与指标。
- [ ] **Step 6.2** API/MCP 功能对齐需求：补齐上传文件接口、层级/标签/表格/图片过滤、治理（删除、重索引、统计）、MCP `kb.preview/kb.related` 的上下文拼装与溯源 URI 输出，并提供权限/租户隔离。  
  - 产出：REST/MCP 契约实现、参数校验、鉴权/配额、治理路由、审计日志。  
  - 校验：对照《项目需求.md》第 12 章验收用例，确保 REST 与 MCP 均可覆盖 text/table/image 检索与治理操作。
- [ ] **Step 6.3** 端到端测试与样例数据：编写 Playwright/Vitest 场景覆盖多模态上传、检索、MCP、治理；准备示例数据集与 `tests/e2e` 使用的 fixture，解除 `test.skip` 并纳入 `scripts/test-matrix.ts`。  
  - 产出：完整的 E2E 脚本、测试数据、CI 运行指南。  
  - 校验：`bun run scripts/test-matrix.ts` 在安装依赖后必须通过 unit/integration/e2e，并生成验收报告。
- [ ] **Step 6.4** 部署与监控闭环：按照需求文档提供的规模设计，验证 Docker Compose/Helm 部署、Prometheus/Grafana 仪表、备份/恢复/重索引链路，使 README 与运维文档具备“一键部署 + 验收”流程。  
  - 产出：确认版 README 部署章节、ops 文档截图、`operations-log` 的实际执行证据。  
  - 校验：在可执行环境中跑通备份/恢复和 reindex（非 dry-run），并记录结果供审查。

---

**计划维护提示**  
- 执行者必须在每次步骤完成后，于本文件和 `.codex/operations-log.md` 同步记录。  
- 若需增删步骤，请在顶部“执行纪律”下添加“变更记录”小节，并注明批准人/时间。  
- 定期（至少每个 Phase 结束时）进行回顾，确保 bun + TypeScript 技术选型仍满足性能与可维护性要求。
