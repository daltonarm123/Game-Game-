# Product Roadmap

Status date: 2026-06-27

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

## Phase 3 — Mostly Completed
- Live-ops baseline tooling is available.
- Push/notification foundations are available through kingdom notifications and live refresh events.
- App store hardening started (TypeScript cleanup, shield/sabotage endpoint tests, payment safety gating).

Launch blockers still open:
- External observability stack (durable metrics/logs/alerts) is not fully wired.
- Integration and E2E test coverage is still shallow for launch-critical flows.
- Production payment rollout and platform billing policy verification remain pending.

## Current Follow-Up Backlog
- Replace simulated/development gem purchases with live Stripe keys in production secrets.
- Add native mobile in-app purchase adapters if App Store / Play Store billing is required instead of web checkout.
- Continue expanding endpoint coverage for settlements, alliances, marketplace, and daily rewards.

## Go-Live Must-Do
- Complete launch checklist in docs/GO_LIVE_CHECKLIST.md.
- Verify shield cooldown/tax/season countdown behavior in staging before release.
- Run full build/test + staging soak + rollback rehearsal before production cutover.
