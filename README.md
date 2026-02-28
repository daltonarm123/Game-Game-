# Crownforge
Modern, maintained, tick-based kingdom strategy game platform.

## Monorepo Layout

- `apps/web` - Browser game client (React + Vite)
- `apps/mobile` - iOS/Android client (Expo/React Native)
- `services/api` - Public API gateway + auth/session endpoints
- `services/game-server` - Tick engine, combat, economy workers
- `packages/shared` - Shared game rules, constants, types
- `infra` - Local infra + deployment templates
- `docs` - Design and roadmap docs

## Quick Start

1. Install Node 20+
2. Install workspace dependencies:
   - `npm install`
3. Start local DB/Redis:
   - `docker compose -f infra/docker-compose.yml up -d`
4. Copy env template to `.env` at repo root and adjust as needed.
5. Run all dev services:
   - `npm run dev`

## Implemented Foundation (Current)

- Postgres-backed API bootstrap/schema creation
- Kingdom registration endpoint
- Kingdom read endpoint (resources/buildings/troops/queues)
- Build queue endpoint (cost + timer + enqueue)
- Train queue endpoint (cost + timer + enqueue)
- War Room v1 attack endpoint + stored attack reports
- Tick worker that auto-completes due build/train queue items
- Tick alignment support for exact 5-minute boundaries (`:00, :05, :10...`)
- Ruleset baseline doc: `docs/RULESET_V1.md`

## API Endpoints (v1)

- `GET /healthz`
- `GET /readyz`
- `POST /api/dev/register`
  - body: `{ "userId": "u1", "username": "Envy", "kingdomName": "NorthEast" }`
- `GET /api/kingdom/:name`
- `POST /api/kingdom/:name/build`
  - body: `{ "buildingCode": "farm" }`
- `POST /api/kingdom/:name/train`
  - body: `{ "troopCode": "footmen", "quantity": 100 }`
- `POST /api/war-room/:attacker/attack`
  - body: `{ "defenderKingdom": "Target", "sentTroops": { "footmen": 1000, "pikemen": 200 } }`
- `GET /api/war-room/reports/:kingdom?limit=25`

## First Milestone (Month 1)

- Account/auth foundation
- Kingdom data model
- Tick loop skeleton
- Build/train queues
- Attack + spy report pipeline (v1)
- Playable web shell and mobile shell
- Dedicated web actions for `Train Troops` and `Attack Kingdom`

## Demo + Funding Prep

- Month-1 demo plan and forward roadmap:
  - `docs/MONTH1_DEMO_AND_ROADMAP.md`
- Strict investor pitch runbook:
  - `docs/INVESTOR_DEMO_SCRIPT.md`
- Local demo env helper scripts:
  - `scripts/start-demo-env.ps1`
  - `scripts/reset-demo.ps1`
  - `scripts/seed-elixer-dev-kingdom.ps1`
  - `scripts/seed-demo-data.ps1`
  - `scripts/smoke-test-demo.ps1`
- Demo env quick setup:
  - `docs/DEMO_ENV_SETUP.md`
  - includes automatic fast local mode for quick training/attack demos
- Fallback recording checklist:
  - `docs/FALLBACK_VIDEO_SHOTLIST.md`
- Ops runbook and backup/restore:
  - `docs/OPERATIONS_RUNBOOK.md`
  - `scripts/backup-db.ps1`
  - `scripts/restore-db.ps1`
