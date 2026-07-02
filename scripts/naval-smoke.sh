#!/usr/bin/env bash
set -euo pipefail

# One-command naval smoke check for prod/staging/local API.
# Usage:
#   API_BASE=https://your-api.example.com ADMIN_TOKEN=... ./scripts/naval-smoke.sh
#   ./scripts/naval-smoke.sh

API_BASE="${API_BASE:-http://localhost:8080}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"

echo "[naval-smoke] API_BASE=${API_BASE}"

die() {
  echo "[naval-smoke] ERROR: $*" >&2
  exit 1
}

check_endpoint() {
  local path="$1"
  local url="${API_BASE}${path}"
  local code
  code="$(curl -sS -o /tmp/naval-smoke-body.json -w "%{http_code}" "$url")"
  if [[ "$code" != "200" ]]; then
    cat /tmp/naval-smoke-body.json >&2 || true
    die "${path} returned HTTP ${code}"
  fi
  echo "[naval-smoke] OK ${path}"
}

check_endpoint "/healthz"
check_endpoint "/readyz"

if [[ -z "$ADMIN_TOKEN" ]]; then
  echo "[naval-smoke] ADMIN_TOKEN not provided; skipping admin backlog/alerts checks."
  echo "[naval-smoke] PASS (base health only)"
  exit 0
fi

fetch_admin_json() {
  local path="$1"
  local code
  code="$(curl -sS -H "Authorization: Bearer ${ADMIN_TOKEN}" -o /tmp/naval-smoke-body.json -w "%{http_code}" "${API_BASE}${path}")"
  if [[ "$code" != "200" ]]; then
    cat /tmp/naval-smoke-body.json >&2 || true
    die "${path} returned HTTP ${code}"
  fi
  cat /tmp/naval-smoke-body.json
}

backlog_json="$(fetch_admin_json "/api/admin/backlog")"
alerts_json="$(fetch_admin_json "/api/admin/alerts")"

lag_seconds="$(echo "$backlog_json" | node -e 'let s=""; process.stdin.on("data",d=>s+=d); process.stdin.on("end",()=>{const j=JSON.parse(s||"{}"); process.stdout.write(String(Number(j?.worker?.lagSeconds||0)));});')"
boats_due="$(echo "$backlog_json" | node -e 'let s=""; process.stdin.on("data",d=>s+=d); process.stdin.on("end",()=>{const j=JSON.parse(s||"{}"); process.stdout.write(String(Number(j?.queues?.boats?.due||0)));});')"
shipments_due="$(echo "$backlog_json" | node -e 'let s=""; process.stdin.on("data",d=>s+=d); process.stdin.on("end",()=>{const j=JSON.parse(s||"{}"); process.stdout.write(String(Number(j?.queues?.shipments?.due||0)));});')"
barter_due="$(echo "$backlog_json" | node -e 'let s=""; process.stdin.on("data",d=>s+=d); process.stdin.on("end",()=>{const j=JSON.parse(s||"{}"); process.stdout.write(String(Number(j?.queues?.barterOffers?.due||0)));});')"
controlled_channels="$(echo "$backlog_json" | node -e 'let s=""; process.stdin.on("data",d=>s+=d); process.stdin.on("end",()=>{const j=JSON.parse(s||"{}"); process.stdout.write(String(Number(j?.naval?.channelsControlled||0)));});')"
closed_channels="$(echo "$backlog_json" | node -e 'let s=""; process.stdin.on("data",d=>s+=d); process.stdin.on("end",()=>{const j=JSON.parse(s||"{}"); process.stdout.write(String(Number(j?.naval?.channelsClosed||0)));});')"
pirate_6h="$(echo "$backlog_json" | node -e 'let s=""; process.stdin.on("data",d=>s+=d); process.stdin.on("end",()=>{const j=JSON.parse(s||"{}"); process.stdout.write(String(Number(j?.naval?.pirateRaids6h||0)));});')"
pirate_breached_6h="$(echo "$backlog_json" | node -e 'let s=""; process.stdin.on("data",d=>s+=d); process.stdin.on("end",()=>{const j=JSON.parse(s||"{}"); process.stdout.write(String(Number(j?.naval?.pirateBreached6h||0)));});')"
active_alerts="$(echo "$alerts_json" | node -e 'let s=""; process.stdin.on("data",d=>s+=d); process.stdin.on("end",()=>{const j=JSON.parse(s||"{}"); const alerts=Array.isArray(j?.alerts)?j.alerts:[]; process.stdout.write(String(alerts.length));});')"

echo "[naval-smoke] worker_lag_seconds=${lag_seconds}"
echo "[naval-smoke] boats_due=${boats_due} shipments_due=${shipments_due} barter_due=${barter_due}"
echo "[naval-smoke] channels_controlled=${controlled_channels} channels_closed=${closed_channels}"
echo "[naval-smoke] pirate_raids_6h=${pirate_6h} pirate_breached_6h=${pirate_breached_6h}"
echo "[naval-smoke] active_alerts=${active_alerts}"

if [[ "$lag_seconds" -gt 600 ]]; then
  die "worker lag too high: ${lag_seconds}s"
fi
if [[ "$boats_due" -gt 0 || "$shipments_due" -gt 0 || "$barter_due" -gt 0 ]]; then
  die "naval due queue items detected (boats=${boats_due}, shipments=${shipments_due}, barter=${barter_due})"
fi

echo "[naval-smoke] PASS"
