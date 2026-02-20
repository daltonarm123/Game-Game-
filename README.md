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
2. Install dependencies:
   - `npm install`
3. Run all dev services:
   - `npm run dev`

## First Milestone (Month 1)

- Account/auth foundation
- Kingdom data model
- Tick loop skeleton
- Build/train queues
- Attack + spy report pipeline (v1)
- Playable web shell and mobile shell
