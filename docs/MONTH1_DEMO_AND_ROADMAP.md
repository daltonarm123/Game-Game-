# Month 1 Demo + Delivery Roadmap

## Month 1 Goal

Ship a playable vertical slice that proves the core game loop:

1. Create a kingdom.
2. Build, train, and tick progression.
3. Attack and receive combat results.
4. Show troop state transitions (`home`, `train`, `away`, return).

This is enough to demo to players and potential backers.

## What Is Implemented Now

1. Web shell with game-like navigation and theme.
2. Kingdom registration and kingdom data read APIs.
3. Build queue API (resource costs + timer).
4. Train queue API (resource costs + timer).
5. War Room attack API with stored reports.
6. Tick worker with aligned 5-minute cadence.
7. Troop movement/return tracking model.
8. Dedicated web pages:
   - `War Room`
   - `Train Troops`
   - `Attack Kingdom`

## Local Test Environment (Playtest Setup)

### Prerequisites

1. Node.js 20+
2. Docker Desktop

### Start Infra

1. `docker compose -f infra/docker-compose.yml up -d`

### Install Dependencies

1. `npm install`

### Start Services

1. API: `npm run dev -w @game-game/api`
2. Tick worker: `npm run dev -w @game-game/game-server`
3. Web: `npm run dev -w @game-game/web`

Default local ports:

1. Web: `http://localhost:5173`
2. API: `http://localhost:8080`
3. Postgres: `localhost:5432`

### Demo Script (10-15 minutes)

1. Register 2 kingdoms via API:
   - `POST /api/dev/register`
2. Queue training for attacker.
3. Wait for tick completion.
4. Open `War Room` and verify troop counts.
5. Launch an attack from `Attack Kingdom`.
6. Show:
   - combat result
   - land taken
   - recent battle list
   - `away` troops and eventual return

## Suggested Next Milestones

### Milestone 2 (2-4 weeks)

1. Overview page connected to live API (no mock values).
2. Buildings page with queue controls and effects.
3. Research tree scaffold + timers.
4. Spy report model + parser for manual paste.

### Milestone 3 (4-8 weeks)

1. Alliance/guild base systems.
2. Seasonal modifiers and return-time formulas.
3. RPS tuning from observed combat samples.
4. In-game notifications/pigeons.

### Milestone 4 (8-12 weeks)

1. Mobile app screens connected to production API.
2. Auth/accounts and basic premium entitlements.
3. Admin tools and anti-abuse logging.
4. Production deploy pipeline and backup policy.

## Investor/Backer Message (Short)

We already have the core loop running in a modern stack with 5-minute ticks, combat, queues, and a playable web shell. Funding accelerates content depth, polish, mobile parity, and live operations.
