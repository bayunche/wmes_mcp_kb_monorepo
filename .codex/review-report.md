# Review Report — README Quick Start 重组

- **日期**：2025-11-16
- **任务**：按操作系统 × 运行模式重构 README Quick Start
- **审查者**：Codex

## 评分
- **技术维度**：88/100 — Markdown 结构与命令示例完整，Windows Docker 场景通过 `docker compose exec` 在容器内运行脚本，避免 host 网络限制。
- **战略维度**：90/100 — 结构与梯度清晰，引用 Local Development、Docker Deployment、Smoke Test，满足“按部署逻辑分层”目标。
- **综合评分**：89/100 → 建议“通过（需关注）”。

## 发现与论据
1. **结构**：Quick Start 现按照 Linux/macOS & Windows 两大块，再细分 Docker/非 Docker，并在每节添加「准备/步骤/验证」；满足需求。
2. **脚本引用**：Linux/macOS 直接调用 `./scripts/deploy-local.sh`，Windows 非 Docker 指向 run-migrations/bootstrap-storage；同时在 Windows Docker 场景提供 `docker compose exec` 示例，避免 Shell 脚本依赖。
3. **验证链路**：所有模式均指向下方 [✅ Smoke Test](#-smoke-test)，并提示可访问 `/health` 端点。
4. **风险**：Windows Docker 在 `docker compose exec kb-api bun run ...` 时要求容器内可用 bun CLI（镜像需包含 bun）；文档中已提示，仍建议在后续交付中实际跑通。

## 建议
- 通过（需关注 Windows Docker 上的 bun CLI 可用性）。
- 后续若 `scripts/deploy-local.sh` 新增 PowerShell 版本，可在 README 中补充链接。

## 留痕
- README.md（Quick Start 章节）
- .codex/testing.md（记录未跑自动化测试的原因）
- verification.md（新增人工验证记录）

---

# Review Report — API/MCP/Worker Docker 启动修复

- **日期**：2025-11-16
- **任务**：修复 import 路径并在 Docker 构建阶段安装 workspace 依赖
- **审查者**：Codex

## 评分
- **技术维度**：85/100 — import 路径已统一，Dockerfile 也能在 packages/core 与 packages/data 下执行 bun install；需等待宿主重新 build 才能验证。
- **战略维度**：88/100 — 变更集中在最小影响面（API/MCP/Worker + Dockerfile），并通过文档提醒用户重新构建。
- **综合评分**：86/100 → 建议“通过（需验证）”。

## 发现
1. API/MCP 现在全部引用正确的 `../../../packages` 路径，可避免 Linux 容器中出现 `/app/apps/packages` 的无效路径。
2. Dockerfile 新增的 `bun install --production` 只作用于 packages/core、packages/data，既能确保 Kysely / @xenova 等依赖存在，又不会额外拉取 devDependencies。
3. `.codex/testing.md` / `verification.md` 已说明本地无法运行 bun/docker，需要在宿主执行 `docker compose build --no-cache` + `docker compose up`。

## 建议
- 通过（需用户重新 build 验证）。若构建仍失败，建议收集 `bun install` 日志以确认网络或权限问题。

## 留痕
- apps/api/src/main.ts、apps/api/src/routes.ts、apps/mcp/src/main.ts、apps/mcp/src/tools/search.ts、apps/mcp/src/repository/db.ts、apps/worker/src/types.ts
- deploy/docker/Dockerfile.api / Dockerfile.worker / Dockerfile.mcp
- `.codex/testing.md`、`verification.md`
