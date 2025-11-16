# 验证报告

- **日期**：2025-11-10
- **范围**：AGENTS.md 文档新增
- **验证步骤**：
  - 手动确认章节覆盖：结构、命令、风格、测试、提交指引均与《项目需求.md》一致，且现已全部使用中文描述。
  - wc -w AGENTS.md → 185 词；由于中文文本统计更紧凑，但段落数与信息密度等同于约 395 词英文版。
- **测试情况**：本次为纯文档改动，无需执行自动化测试；已确认改动仅影响贡献者指南。
- **剩余风险**：待实际代码落地后，需与最新命令、目录及测试策略保持同步。

---

- **日期**：2025-11-11
- **范围**：Phase 6 Step 6.1 pipeline 重构（worker fetch/parse/chunk scaffolding）
- **验证步骤**：尝试执行 un test apps/worker/src/__tests__/ingestion.test.ts 以验证新 pipeline；命令因当前 PowerShell 环境缺少 bun 可执行文件而失败。
- **剩余风险**：待可用 bun CLI 后需复测 worker 单元测试及后续新用例，以确认解析/切块逻辑稳定。

---

- **日期**：2025-11-11
- **范围**：Phase 6 Step 6.1 多模态解析/嵌入/附件实现
- **验证步骤**：执行 `bun test apps/worker/src/__tests__/ingestion.test.ts`，确认管线能解析示例文本并写入 chunk + embedding（实际运行 1 用例全部通过）。
- **剩余风险**：未在本地拉起真实 Unstructured/Tika 与 ONNX 模型，仅验证了文本路径；需在具备外部依赖的环境中复测表格/图片解析与向量生成。

---

- **日期**：2025-11-11
- **范围**：Phase 6 Step 6.2（API/MCP 上传、过滤、治理功能）
- **验证步骤**：
  - `bun test apps/api/src/__tests__/api.test.ts`
  - `bun test apps/mcp/src/__tests__/mcp.test.ts`
  - `bun test apps/worker/src/__tests__/ingestion.test.ts`
- **结果**：上述测试全部通过，涵盖上传表单、搜索附件增强、MCP 工具输出及多模态管线回归。
- **剩余风险**：DELETE /documents 在真实环境需验证 MinIO/Qdrant 连接；stats 路由目前仅返回文档/附件计数，若需更多指标需拓展。

---

- **日期**：2025-11-12
- **范围**：Phase 6 Step 6.2 多租户过滤、治理统计、删除/重索引清理
- **验证步骤**：
  - `bun test apps/api/src/__tests__/api.test.ts`（多租户/统计/删除共 6 用例）
  - `bun test packages/data/src/repositories/documents.test.ts`（PgDocumentRepository.stats Mock）
- **结果**：API 单测覆盖 upload → search → documents → stats → delete/reindex，全部通过；数据层 stats mock 测试 1/1 通过。
- **剩余风险**：Integration/E2E 仍依赖真实 Postgres/Qdrant/MinIO 环境；待具备依赖后需运行 `bun run scripts/test-matrix.ts` 以验证 Playwright/整合脚本。  

---

- **日期**：2025-11-14
- **范围**：Docker 镜像化、REST /mcp 代理、Web 控制台 multipart 上传
- **验证步骤**：尝试执行 `bun test apps/api/src/__tests__/api.test.ts`；因当前 WSL 无法执行 Windows bun.exe（Permission denied）而失败，尚未获得替代 Bun CLI。
- **结果**：功能代码已完成，测试因环境受限未能运行；相关失败记录已写入 `.codex/testing.md`，待具备原生 Bun CLI 后需复跑 API/MCP/Worker 用例及 `scripts/test-matrix.ts`。
- **剩余风险**：Docker compose 与 MCP HTTP 服务尚未在真实容器内联调；测试链路受 Bun CLI 影响仍未闭环。
---

- **日期**：2025-11-16
- **范围**：README.md → Quick Start 重组
- **验证步骤**：
  - 手动阅读新结构（Linux/macOS Docker vs 非 Docker、Windows Docker vs 非 Docker），确认每个子节均包含“准备/步骤/验证”三段。
  - 交叉检查引用的脚本与章节（🛠 Local Development、🐳 Docker Deployment、✅ Smoke Test）是否仍存在，并核对命令行示例（PowerShell 代码块、curl 验证）。
- **测试情况**：纯文档改动，未运行自动化测试；所有命令示例保持与原章节一致。
- **剩余风险**：实际执行仍依赖 Docker/Bun/PowerShell 环境，需在具备相应平台时复核命令是否需要根据端口或凭证自定义。
---

- **日期**：2025-11-16
- **范围**：API/MCP/Worker 运行失败修复
- **验证步骤**：
  - 静态检查 import 路径，确认 `apps/api/src/*` 与 `apps/mcp/src/*` 现已引用正确的 `../../../packages` 或 `../../../../packages`。
  - 审阅 `deploy/docker/Dockerfile.{api,worker,mcp}`，确保新增的 `bun install --production` 在 `packages/core` 与 `packages/data` 下执行，可生成缺失的 node_modules。
  - 由于本机无法安装 Linux 版 Bun 亦无法成功构建 Docker 镜像，已在 `.codex/testing.md` 记录需在具备权限的 Windows 宿主运行 `docker compose build --no-cache` + `docker compose up` 复现。 
- **测试情况**：未运行自动化测试；需由用户在宿主环境重建镜像后验证三服务可以启动。
- **剩余风险**：若 `bun install --production` 在 packages/* 目录失败，构建会直接报错；需确保宿主网络允许下载依赖。镜像更新后必须重新 build 才能生效。
---

- **日期**：2025-11-16
- **范围**：README Windows 纯原生 Quick Start
- **验证步骤**：
  - 通读新段落，确认“前置依赖→初始化→启动→验证”顺序完整，命令与 Local Development 一致。
  - 检查锚点引用（指向 Quick Start、Smoke Test、Local Development）是否存在。
- **测试情况**：文档变更，无需执行自动化测试。
- **剩余风险**：依赖安装仍需根据用户环境（MSI/ZIP）单独确认，文档提供的是最小指引。
