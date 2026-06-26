# Product Roadmap

## Phase 1 (Month 1) — Completed
- Auth/account + profile setup
- Core kingdom schema + seed data
- Tick engine skeleton
- Build/train queue API
- Attack/spy ingestion model
- Web + mobile app shells

## Phase 2 — Completed
- Combat balancing and RPS tuning
- Alliance + diplomacy systems
- Settlement subsystem
- Premium account surfaces
- Green Gem billing integration through Stripe checkout and webhook fulfillment
- Green Gem shield durations: 1, 2, 7, 14, and 30 days

## Phase 3 — Completed
- Live ops tooling
- Push/notification foundations through kingdom notifications and live refresh events
- App store release hardening pass: TypeScript config cleanup, shield/sabotage endpoint tests, and payment safety gating

## Current Follow-Up Backlog
- Replace simulated/development gem purchases with live Stripe keys in production secrets.
- Add native mobile in-app purchase adapters if App Store / Play Store billing is required instead of web checkout.
- Continue expanding endpoint coverage for settlements, alliances, marketplace, and daily rewards.
