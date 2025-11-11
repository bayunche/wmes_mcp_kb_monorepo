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

echo "==> Step 1: Launching infrastructure containers (db, vectordb, object, redis, queue)..."
docker compose up -d db vectordb object redis queue

echo "==> Step 2: Bootstrapping MinIO buckets & Qdrant collections..."
run_bun_script "scripts/bootstrap-storage.ts"

echo "==> Step 3: Applying database migrations..."
ensure_psql
run_bun_script "scripts/run-migrations.ts"

echo "==> Step 4: Syncing model/OCR artifacts (warnings are acceptable if URLs require auth)..."
run_bun_script "scripts/sync-models.ts"

echo "✅ Local environment bootstrap completed."
echo "   You can now start kb-api / kb-worker / mcp-server via docker compose or bun dev scripts."
