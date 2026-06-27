#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DB_NAME="crownforge-api-itest-db"
DB_PORT="55432"
DB_USER="gamegame"
DB_PASS="gamegame"
DB_DATABASE="gamegame"
DB_URL="postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:${DB_PORT}/${DB_DATABASE}"

cleanup() {
  docker rm -f "$DB_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cleanup

echo "[api-itest] Starting transient Postgres container"
docker run -d \
  --name "$DB_NAME" \
  -e POSTGRES_USER="$DB_USER" \
  -e POSTGRES_PASSWORD="$DB_PASS" \
  -e POSTGRES_DB="$DB_DATABASE" \
  -p "${DB_PORT}:5432" \
  postgres:16 >/dev/null

echo "[api-itest] Waiting for Postgres readiness"
for i in $(seq 1 60); do
  if docker exec "$DB_NAME" pg_isready -U "$DB_USER" -d "$DB_DATABASE" >/dev/null 2>&1; then
    break
  fi
  sleep 1
  if [[ "$i" == "60" ]]; then
    echo "[api-itest] Postgres did not become ready in time"
    exit 1
  fi
done

echo "[api-itest] Running API integration tests against transient DB"
DATABASE_URL="$DB_URL" NODE_ENV=test npm run test:api:integration

echo "[api-itest] Completed successfully"
