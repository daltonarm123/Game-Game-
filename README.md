# Game Game

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
- Kingdom read endpoint (resources/buildings/queue)
- Build queue endpoint (cost + timer + enqueue)
- Tick worker that auto-completes due build queue items

## API Endpoints (v1)

- `GET /healthz`
- `POST /api/dev/register`
  - body: `{ "userId": "u1", "username": "Envy", "kingdomName": "NorthEast" }`
- `GET /api/kingdom/:name`
- `POST /api/kingdom/:name/build`
  - body: `{ "buildingCode": "farm" }`

## First Milestone (Month 1)

- Account/auth foundation
- Kingdom data model
- Tick loop skeleton
- Build/train queues
- Attack + spy report pipeline (v1)
- Playable web shell and mobile shell
