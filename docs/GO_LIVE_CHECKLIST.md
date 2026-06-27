# Crownforge Go-Live Checklist

Status date: 2026-06-27
Owner: Engineering + Live Ops

## Gameplay Integrity
- [x] Shield cooldown bypass fixed in API and worker state transitions.
- [x] API economy tax preview now uses shared tax formula.
- [x] Season snapshot countdown derived from wall-clock progression to avoid API drift.
- [ ] Run balance validation scenarios for attack/explore/sabotage against staging data.
- [ ] Run exploit tests for multi-account farming and repeated target pressure.

## Testing and Release Confidence
- [x] Workspace unit tests run green (`npm test`).
- [x] CI workflow added for test/build/audit gates (`.github/workflows/ci.yml`).
- [x] Initial API transient-DB integration harness added (`scripts/run-api-integration-with-transient-db.sh`) with shield cooldown integration coverage.
- [ ] Add API integration tests against a transient Postgres instance for war, market, settlements, alliances.
- [ ] Add browser E2E tests for register/login, build/train, war-room, market, premium flows.
- [ ] Add soak tests for tick catch-up and long-running queue processing.

## Observability and Incident Response
- [ ] Ship durable metrics backend (not only in-memory process stats).
- [ ] Ship centralized structured logs.
- [ ] Configure SLO alerts for tick lag, error rate, and p95 latency.
- [ ] Run game-day incident drills and DB restore rehearsal.

## Security and Dependency Hygiene
- [ ] Triage and fix npm vulnerabilities from `npm audit` output.
- [x] Add CI security gate for dependency checks.
- [x] Document key rotation and secret rollover process.
- [ ] Review session controls and anti-abuse limits for launch traffic.

## Payments and Platform Compliance
- [ ] Ensure production Stripe keys/webhook secret are configured and validated.
- [x] Disable simulated purchase path in production environment.
- [ ] Confirm mobile billing compliance path (web checkout vs native store billing).

## Deployment Readiness
- [x] Local go-live gate script added (`npm run go-live:check`).
- [ ] Staging dry-run of deploy checklist from docs/OPERATIONS_RUNBOOK.md.
- [ ] Validate rollback procedure with previous stable image and optional DB restore.
- [ ] Final go/no-go review with Engineering, Product, and Ops.

## Notes
This checklist is intentionally strict. If any item remains unchecked, production launch risk increases and should be explicitly accepted by stakeholders.
