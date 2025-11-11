# Testing Log

| 时间 | 类型 | 命令 | 结果 |
| --- | --- | --- | --- |
| 2025-11-10T09:18:05+08:00 | 文档验证 | `wc -w AGENTS.md` | 395 词，满足 200-400 词要求。 |
| 2025-11-10T09:18:05+08:00 | 说明 | N/A | 本次仅编写文档，暂无可执行自动化测试；已人工审阅章节完整性与内容准确性。 |
| 2025-11-10T09:25:25+08:00 | 文档验证 | `wc -w AGENTS.md` | 185 词（因中文文本计数方式不同，长度与原英文版本相当）。 |
| 2025-11-10T09:50:40+08:00 | bun test | `bun test` | 运行基础 smoke test，结果 1 通过 0 失败。 |
| 2025-11-10T10:05:30+08:00 | bun test | `bun test` | Phase 1 变更后复跑 smoke test，全部通过。 |
| 2025-11-10T13:56:00+08:00 | bun test | `bun test` | 新增落库脚本与模型 manifest 后复跑，结果 1 通过 0 失败。 |
| 2025-11-10T14:20:20+08:00 | bun test | `bun test` | Phase 2 Step2.1：shared-schemas 包 6 个测试全部通过。 |
| 2025-11-10T14:30:20+08:00 | bun test | `bun test` | Phase 2 Step2.2：worker ingestion 测试通过。 |
| 2025-11-10T14:40:10+08:00 | bun test | `bun test` | Phase 2 Step2.3：vector 客户端测试通过，含远程 mock。 |
| 2025-11-10T14:50:10+08:00 | bun test | `bun test` | Phase 3 Step3.1：retrieval 测试通过。 |
| 2025-11-10T15:00:20+08:00 | bun test | `bun test` | Phase 3 Step3.2：MCP 工具测试通过。 |
| 2025-11-10T15:10:10+08:00 | bun test | `bun test` | Phase 3 Step3.3：API 路由/鉴权测试通过，累计 17 个用例。 |
| 2025-11-10T15:20:20+08:00 | bun test | `bun test` | Phase 4 Step4.1：新增 metrics 包与 API/Worker 仪表后全量 19 个用例通过。 |
| 2025-11-10T15:30:10+08:00 | bun test | `bun test` | Phase 4 Step4.2：运维脚本落地后全量 19 个用例通过。 |
| 2025-11-10T15:45:05+08:00 | 脚本 | `bun run scripts/test-matrix.ts` | 执行测试矩阵：unit 通过，integration/e2e 因工具缺失跳过并记录提示。 |
| 2025-11-10T15:50:10+08:00 | 脚本 | `bun run scripts/test-matrix.ts` | vitest 环境配置后再次运行：unit 通过，integration/e2e 因依赖缺失跳过。 |
| 2025-11-10T15:55:05+08:00 | 脚本 | `bun run scripts/test-matrix.ts` | 引入 E2E 剧本后，unit 20/20 通过，integration/e2e 缺依赖跳过。 |
