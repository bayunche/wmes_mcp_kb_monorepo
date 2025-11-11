# Repository Guidelines（仓库指南）

## 项目结构与模块组织
- `src/api` 承载 FastAPI 网关与通用鉴权/中间件；`src/worker` 负责接收、切块、嵌入计算及队列消费；`src/mcp` 暴露知识库检索工具供 Agent 调用，三者通过共享的 domain/service 层解耦。
- 基础设施文件集中在 `deploy/docker`（Compose、健康检查）与 `ops/scripts`（初始化、备份、重索引）；数据库迁移保存在 `db/migrations`，向量/模式种子位于 `db/seeds`，确保任何部署都能一键重建。
- 测试夹具分别放在 `tests/unit` 与 `tests/e2e`，示例文档存放 `assets/samples`，离线模型与 OCR 资源位于 `models/weights`（需加入 .gitignore），贡献者向导文档统一放在 `docs/`，方便审查者追踪引用。

## 构建、测试与开发命令
- `make install`：通过 Poetry/pip 初始化 Python 3.11 工具链并安装 pre-commit 钩子，首次克隆后必跑。
- `make build`：构建并推送 `kb-api`、`kb-worker`、`mcp-server` Docker 镜像，供本地或离线环境复用。
- `make dev`：执行 `docker compose up -d db vectordb object queue kb-api kb-worker mcp-server` 启动全部依赖；`make stop` 关闭环境，调试时可改为 `make dev LOG_LEVEL=debug`。
- `make db:migrate`：运行 `docker compose exec kb-api alembic upgrade head`，保证 Postgres 与 pgvector schema 同步，并在更新后追加 `db/seeds`。
- `make test`：执行 `pytest -m "not e2e" --cov=src --cov-report=term-missing`；`make e2e` 先写入示例文档，再重放需求文档第 12 章的端到端场景，默认包含多模态数据。

## 编码风格与命名规范
- Python 组件锁定 3.11，4 空格缩进；函数使用 snake_case，类使用 PascalCase，CLI 目标采用 kebab-case；统一运行 Black（line-length 100）与 Ruff（`make lint`），并附带 Ruff autofix 结果。
- TypeScript 工具（例如 MCP 客户端脚本）遵循 ESLint + Prettier，命名采用 camelCase，并优先具名导出；若生成类型定义，保存在 `types/` 并使用 index.ts 聚合。
- 所有环境变量在 `.env.example` 声明，通过 Pydantic 配置类注入，避免散落的 `os.getenv`，提交 PR 前需更新示例文件保持字段齐全。

## 测试规范
- 单元测试放在 `tests/unit/<module>/test_<feature>.py`，与 `src` 目录结构一致；外部依赖通过 pytest fixture stub，同时利用 faker 数据覆盖异常分支。
- 集成测试需拉起 docker compose 服务，覆盖接收 → 切块 → 索引 → 检索流程及 MCP 工具曝光，并记录 `logs/integration/*.log` 便于追踪。
- 端到端测试位于 `tests/e2e`，必须逐条验证多模态上传、自然语言检索、表格聚焦、图片召回、结构过滤、MCP 检索与治理操作；保持 ≥85% 行覆盖，并在 PR 附 `coverage.xml` 与关键截图。

## 提交与 Pull Request 准则
- 遵循 Conventional Commits（如 `feat(api): add chunk reranker hooks`），每次提交聚焦单一模块并标注任务 ID，禁止在同一提交混合 API + Infra 改动。
- PR 描述需包含：变更摘要、关联 issue/规范条款、`make test` 与 `make e2e` 输出、所有配置或模型变动，以及涉及 UI/观测面时的截图或日志，并说明是否需要重新灌入模型或数据。
- 禁止新增自研安全控制或私有依赖，必须复用仓库内既定的鉴权、存储与模型资产，若发现冗余实现需同步在 PR 中说明删除原因。

## 运维与知识文档
- `docs/ingestion.md`：详述上传→解析→切块→嵌入→持久化流程，列出脚本 `ops/scripts/backup|restore|reindex.ts` 的 dry-run 说明与执行示例。
- `docs/retrieval.md`：解释 HybridRetriever 权重、向量推理与 API/MCP 集成策略，提供调优建议。
- `docs/mcp.md`：列出 MCP 工具输入输出、数据源、调试办法，确保 Agent 与 REST 行为一致。
- `/metrics`：默认由 `apps/api/src/main.ts` 暴露，可搭配 Prometheus/Grafana；Worker 亦会写入 `kb_ingestion_*` 指标。
- 若需扩展脚本或文档，请同步更新以上文件并在 PR 描述中链接对应章节。
