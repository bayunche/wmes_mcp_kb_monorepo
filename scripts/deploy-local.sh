#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE_PATH="${ENV_FILE:-.env}"
BUN_BIN="${BUN_BIN:-bun}"
BUN_ENV_VARS=(
  "BUN_INSTALL=${BUN_INSTALL:-$ROOT_DIR/.bun}"
  "BUN_INSTALL_CACHE_DIR=${BUN_INSTALL_CACHE_DIR:-$ROOT_DIR/.bun-cache}"
  "BUN_TMPDIR=${BUN_TMPDIR:-$ROOT_DIR/.bun-tmp}"
  "TMPDIR=${TMPDIR:-$ROOT_DIR/.bun-tmp}"
)
START_APPS=${START_APPS:-false}
SKIP_BOOTSTRAP=${SKIP_BOOTSTRAP:-false}
SKIP_MODELS=${SKIP_MODELS:-false}
STACK_MODE=${STACK_MODE:-docker}
INFRA_SERVICES="${INFRA_SERVICES:-db vectordb object redis queue}"
APP_SERVICES="${APP_SERVICES:-kb-api kb-worker mcp-server}"

usage() {
  cat <<'EOF'
Usage: scripts/deploy-local.sh [options]

Options:
  --env-file <path>      指定要加载的环境文件（默认 .env）
  --start-apps           在基础设施准备后，自动启动 kb-api/kb-worker/kb-mcp 容器
  --skip-bootstrap       跳过 MinIO/Qdrant 初始化（适用于已初始化环境）
  --skip-models          跳过模型/权重同步
  --stack-mode <docker>  指定启动方式，当前仅支持 docker
  -h, --help             显示此帮助
环境变量 START_APPS、SKIP_BOOTSTRAP、SKIP_MODELS、STACK_MODE 同样可覆盖相同行为。
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      ENV_FILE_PATH="$2"
      shift 2
      ;;
    --start-apps)
      START_APPS=true
      shift
      ;;
    --skip-bootstrap)
      SKIP_BOOTSTRAP=true
      shift
      ;;
    --skip-models)
      SKIP_MODELS=true
      shift
      ;;
    --stack-mode)
      STACK_MODE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      ;;
  esac
done

if [[ ! -f "$ENV_FILE_PATH" ]]; then
  echo "❌ Environment file '$ENV_FILE_PATH' not found. Use --env-file to specify路径。"
  exit 1
fi

case "$STACK_MODE" in
  docker|bun)
    ;;
  *)
    echo "❌ Unsupported STACK_MODE '$STACK_MODE'. Use 'docker' or 'bun'."
    exit 1
    ;;
esac

ensure_psql() {
  if ! command -v psql >/dev/null 2>&1; then
    echo "❌ psql command not found. Install PostgreSQL client tools or run migrations inside the db container."
    exit 1
  fi
}

run_bun_script() {
  VARS=("${BUN_ENV_VARS[@]}" "ENV_FILE=$ENV_FILE_PATH")
  env "${VARS[@]}" "$BUN_BIN" run "$1"
}

if [[ "$STACK_MODE" == "docker" ]]; then
  echo "==> Step 1: Launching infrastructure containers (${INFRA_SERVICES})..."
  docker compose up -d ${INFRA_SERVICES}
else
  echo "==> Step 1: STACK_MODE=bun，检测本地依赖服务…"
  check_or_hint "psql" "Postgres 客户端" "请安装 PostgreSQL client (https://www.postgresql.org/download/)"
  check_or_hint "qdrant" "Qdrant" "参考 https://qdrant.tech/documentation/install/ 安装"
  check_or_hint "minio" "MinIO Server" "参考 https://min.io/docs/minio/linux/reference/minio-server.html"
  check_or_hint "redis-server" "Redis" "参考 https://redis.io/docs/getting-started/ 安装"
  check_or_hint "rabbitmq-server" "RabbitMQ" "参考 https://www.rabbitmq.com/docs/install-generic-unix"
  print_bun_service_guidance
fi

if [[ "$SKIP_BOOTSTRAP" == "false" ]]; then
  echo "==> Step 2: Bootstrapping MinIO buckets & Qdrant collections..."
  run_bun_script "scripts/bootstrap-storage.ts"
else
  echo "==> Step 2: Skipped storage bootstrap (SKIP_BOOTSTRAP=true)."
fi

echo "==> Step 3: Applying database migrations..."
ensure_psql
run_bun_script "scripts/run-migrations.ts"

if [[ "$SKIP_MODELS" == "false" ]]; then
  echo "==> Step 4: Syncing model/OCR artifacts..."
  run_bun_script "scripts/sync-models.ts"
else
  echo "==> Step 4: Skipped model sync (SKIP_MODELS=true)."
fi

if [[ "$STACK_MODE" == "docker" && "$START_APPS" == "true" ]]; then
  echo "==> Step 5: Starting app containers (${APP_SERVICES})..."
  docker compose up -d ${APP_SERVICES}
fi

echo "✅ Local environment bootstrap completed."
if [[ "$STACK_MODE" == "docker" ]]; then
  if [[ "$START_APPS" == "true" ]]; then
    echo "   Apps are running via docker compose. Visit http://localhost:8080/health 等端点检查。"
  else
    echo "   运行 'docker compose up -d ${APP_SERVICES}' 可启动 API/Worker/MCP 容器。"
  fi
else
  cat <<EOF
   下一步：在本地 shell 启动 Bun 应用进程：
     START_WORKER=true ENV_FILE=$ENV_FILE_PATH $BUN_BIN run apps/worker/src/main.ts
     START_API_SERVER=true ENV_FILE=$ENV_FILE_PATH API_TOKEN=dev-token $BUN_BIN run apps/api/src/main.ts
     START_MCP_SERVER=true ENV_FILE=$ENV_FILE_PATH $BUN_BIN run apps/mcp/src/main.ts
EOF
fi
command_available() {
  command -v "$1" >/dev/null 2>&1
}

print_bun_service_guidance() {
  echo "   以下服务需手动启动，示例命令供参考："
  cat <<'EOF'
     • Postgres (db)
         systemctl start postgresql  # 或 pg_ctl -D /var/lib/postgresql/data start
     • Qdrant (vectordb)
         qdrant --config-path /etc/qdrant/config.yaml
     • MinIO (object)
         minio server /data --console-address ":9001"
     • Redis
         redis-server --daemonize yes
     • RabbitMQ (queue)
         rabbitmq-server -detached
EOF
}

check_or_hint() {
  local cmd="$1"
  local name="$2"
  local install_hint="$3"
  if command_available "$cmd"; then
    echo "   ✓ $name ($cmd) 已安装"
  else
    echo "   ⚠️  未找到 $name，$install_hint"
  fi
}
