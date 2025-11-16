# Quick Start 重组草案（2025-11-16 / Codex）

## 结构

1. Linux / macOS
   - 使用 Docker Compose
   - 本地原生（Bun 模式）
2. Windows（纯原生环境）
   - 使用 Docker Desktop（PowerShell / CMD）
   - 本地原生（Bun + 手动依赖）

## 每个子节需要包含的内容

| 模块 | 说明 |
| --- | --- |
| 「准备」 | 前置依赖（Bun/psql/Docker Desktop/PowerShell 等）、环境文件（.env/.env.docker/.env.docker.local）。 |
| 「初始化」 | `bun install`、复制 env、同步脚本等。Docker 场景额外包括 `docker compose build` 或 `./scripts/deploy-local.sh --stack-mode docker`。 |
| 「启动」 | 非 Docker：`./scripts/deploy-local.sh --stack-mode bun` 或 PowerShell 手动运行 run-migrations/bootstrap-storage + 启动服务。Docker：脚本或 `docker compose up -d`。 |
| 「验证」 | 统一引用 README ✅ Smoke Test，指向 curl 示例。 |

## 复用现有章节

- Linux/macOS → 链接“🛠 Local Development（Linux/macOS）”。
- Windows → 链接“🛠 Local Development（Windows）”。
- Docker 场景 → 链接“🐳 Docker Deployment（6 步）”。
- 验证 → 链接“✅ Smoke Test”。

## 额外提示

- Windows Docker 场景强调在 PowerShell/CMD 中执行，避免 WSL 路径问题。
- Windows 非 Docker 需列出手动安装服务 + PowerShell 变量示例。
- Linux/macOS 非 Docker 场景说明脚本 `--stack-mode bun` 已在 Step 3 启动基础设施 + 迁移，如需手动请参考 Local Development。 
