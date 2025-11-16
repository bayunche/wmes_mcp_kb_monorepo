# 风险清单

> 日期：2025-11-14 执行者：Codex

| 风险 | 证据 | 影响 | 建议对策 | 状态 |
| --- | --- | --- | --- | --- |
| 基础设施从未实际联调 | `.codex/testing.md:19-23` 显示三次 `bun run scripts/test-matrix.ts` 仅跑到 unit；`verification.md:38-44` 明确标注 “待具备真实 Postgres/Qdrant/MinIO 环境后再验证” | 无法证明 API/Worker/MCP 能在 Postgres/Qdrant/MinIO/RabbitMQ 上运行，Step 6.2 的“完成”缺少证据 | 按 `docs/ingestion.md` 启动 docker compose，运行 `scripts/run-migrations.ts` 与 `scripts/test-matrix.ts`，并把成功日志/指标写回 `.codex/testing.md` 与 `verification.md` | 新增 `.env.docker`、Dockerfile、compose build，但仍待实际执行记录 |
| Integration/E2E 仍为内存 stub 或直接 skip | `tests/integration/api.integration.test.ts:1-70` 仅使用 Memory repositories；`tests/e2e/knowledge.e2e.ts:14-48` 默认 `test.skip` 且调用并不存在的 `/mcp/related` HTTP 路径 | 关键链路（上传 → 切块 → 检索 → MCP）没有跨服务验证，无法捕捉 storage/queue/Qdrant 交互 bug | 补写对真实仓储的 integration，用 docker-compose 服务跑一次；修正 Playwright 用例改调 MCP server/Inspector，并在 `.codex/testing.md` 记录执行结果 | `/mcp/*` 代理与 E2E 断言已补齐，仍需在真实依赖环境运行 |
| Web 控制台上传路径与真实需求脱节 | `apps/web/src/components/UploadForm.tsx:10-49`、`apps/web/src/api.ts:9-47` 仅调用 `/documents` JSON，新流程需要 multipart `/upload` + MinIO 附件 | UI 无法演练 Phase 6.2 的“上传文件→附件预览→治理”场景，无法给验收人员提供可视化入口 | 将 UploadForm 改为 multipart 上传并显示附件/预览，新增 MCP 调试入口，同时配套截图写入 docs 或 README | 已完成：控制台支持 multipart 上传、附件列表与 MCP 预览 |
| MCP/REST 契约差异导致 E2E 示例不可运行 | `tests/e2e/knowledge.e2e.ts:14-48` 调用 `/mcp/related`，而 `apps/api/src/routes.ts:35-305` 并未暴露该路由；当前没有 HTTP 代理可触发 MCP 结果 | Agent/E2E 无法复现设计稿中的治理流程，用户无法通过 HTTP 直接调用 MCP 工具 | 提供 `/mcp/*` HTTP 代理或更新 E2E/文档改用 `apps/mcp` server + Inspector；同时在 docs/mcp.md 补充如何从 REST 触达 MCP | 已新增 API 代理 + MCP HTTP server，待后续联调验证 |
