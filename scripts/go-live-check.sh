#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[go-live-check] Installing dependencies"
npm ci

echo "[go-live-check] Running tests"
npm test

echo "[go-live-check] Building workspaces"
npm run build

echo "[go-live-check] Running dependency audit (high+)"
npm audit --audit-level=high

echo "[go-live-check] Completed successfully"
