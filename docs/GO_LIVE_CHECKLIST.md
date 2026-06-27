# Crownforge Go-Live Checklist

Status date: 2026-06-27
Owner: Engineering + Live Ops

## Core Gameplay Integrity
- [x] Shield cooldown bypass fixed in API and worker state transitions.
- [x] API economy tax preview now uses shared tax formula.
- [x] Season snapshot countdown derived from wall-clock progression to avoid API drift.
- [ ] Run balance validation scenarios for attack, explore, spy, sabotage, and prayer outcomes using staged kingdoms at multiple sizes.
- [ ] Verify queue fairness under load so completion ordering is deterministic and not request-order exploitable.
- [ ] Validate troop return timers and movement cleanup for all combat and exploration outcomes.
- [ ] Validate alliance member cap, role transitions, and project unlock progression against expected formulas.
- [ ] Verify settlement slot limits, upgrade caps, and wellbeing modifiers across all settlement sizes.
- [ ] Confirm premium-only features gracefully degrade for non-premium players without hidden blockers.

## Economy and Abuse Prevention
- [ ] Build an economy simulation pass for 7-day and 30-day progression with expected resource, land, and gem inflation bounds.
- [ ] Add alert thresholds for suspicious resource transfers, listing manipulation, and repeated low-risk farming loops.
- [ ] Add anti-abuse rate limits for account creation, login attempts, and high-frequency action endpoints.
- [ ] Add account trust/risk flags for repeated multi-account interaction patterns.
- [ ] Validate tax, marketplace, and loot loops cannot produce net-positive exploits without proportional risk.
- [ ] Add periodic integrity jobs for land, population, troop totals, and orphaned queue/movement records.

## Testing and Release Confidence
- [x] Workspace unit tests run green (`npm test`).
- [x] CI workflow added for test/build/audit gates (`.github/workflows/ci.yml`).
- [x] Initial API transient-DB integration harness added (`scripts/run-api-integration-with-transient-db.sh`) with shield cooldown, marketplace, alliances, settlements, and war scenario coverage.
- [ ] Expand API transient-DB integration tests for sabotage, prayers, premium purchase fulfillment, and reconciliation endpoints.
- [ ] Add browser E2E tests for register/login, build/train, war-room, market, premium purchase, daily bonus, and account settings.
- [ ] Add mobile E2E smoke tests for login, overview refresh, build/train, war-room actions, and logout.
- [ ] Add contract tests for web and mobile against API response schemas for launch-critical endpoints.
- [ ] Add soak tests for tick catch-up and long-running queue processing.
- [ ] Add deterministic replay tests for core combat and operation outcomes to detect formula regressions.

## Observability and Incident Response
- [ ] Ship durable metrics backend (not only in-memory process stats).
- [ ] Ship centralized structured logs with trace IDs from API to worker.
- [ ] Ship distributed tracing for API and game-server request/tick paths.
- [ ] Configure SLO alerts for tick lag, error rate, p95 latency, queue backlog growth, and webhook failure rates.
- [ ] Build live dashboards for action throughput, economy faucets/sinks, and player concurrency.
- [ ] Add runbook-driven paging policy with ownership and escalation paths per alert class.
- [ ] Run game-day incident drills and DB restore rehearsal.

## Security, Privacy, and Compliance
- [x] Add CI security gate for dependency checks.
- [x] Document key rotation and secret rollover process.
- [ ] Triage and fix npm vulnerabilities from `npm audit` output.
- [ ] Enforce strict auth/session controls with token expiry checks and revocation behavior verification.
- [ ] Verify CORS, CSP, and secure header policy for web production deployment.
- [ ] Add PII handling policy for logs, backups, and support tools.
- [ ] Confirm data retention and deletion policy for player account and payment-linked records.
- [ ] Perform endpoint authorization audit to ensure kingdom ownership checks on all mutating routes.

## Payments and Monetization Readiness
- [ ] Ensure production Stripe keys and webhook secrets are configured and validated end-to-end.
- [x] Disable simulated purchase path in production environment.
- [ ] Add webhook retry monitoring and dead-letter handling for failed entitlement updates.
- [ ] Validate duplicate webhook/idempotency handling for all purchase events.
- [ ] Confirm mobile billing compliance path (web checkout versus native store billing) before store submission.
- [ ] Add fraud guardrails for repeated charge attempts and suspicious gem purchase behavior.
- [ ] Add finance reconciliation report for purchases, gems granted, and refunds.

## Frontend and UX Launch Quality
- [ ] Audit all pages for responsive layout quality across common desktop and mobile breakpoints.
- [ ] Add empty-state, loading-state, and retry UX consistency across major screens.
- [ ] Confirm first-login daily interstitial ad behavior works with built-in fallback and configurable external ad URL.
- [ ] Validate accessibility basics: keyboard navigation, focus visibility, contrast, and semantic labels.
- [ ] Fix any blocking console errors and unhandled promise rejections in production build.
- [ ] Finalize user-facing copy for onboarding, errors, premium upsell, and support links.

## Deployment and Infrastructure Readiness
- [x] Local go-live gate script added (`npm run go-live:check`).
- [ ] Staging dry-run of deploy checklist from `docs/OPERATIONS_RUNBOOK.md`.
- [ ] Validate rollback procedure with previous stable image and optional DB restore.
- [ ] Verify backup schedule, restore time objective, and backup integrity checks.
- [ ] Confirm infrastructure autoscaling and resource limits under load-test profiles.
- [ ] Validate worker singleton/advisory-lock behavior during rolling deploys.
- [ ] Verify environment parity between staging and production for critical flags and secrets.

## Live Ops and Player Support
- [ ] Publish launch-day moderation, incident, and player communication plan.
- [ ] Define support SLA tiers and escalation workflow for payment and account recovery tickets.
- [ ] Add admin tooling checks for invisible admin account, abuse actions, and emergency controls.
- [ ] Prepare post-launch tuning playbook with safe config levers and rollback thresholds.
- [ ] Establish launch-week cadence for metrics review, exploit triage, and balance hotfix decisions.

## Product Analytics and Decisioning
- [ ] Define launch KPI set: retention, conversion, ARPDAU, session depth, and action funnel completion.
- [ ] Instrument analytics events for onboarding, first build/train, first war action, first purchase, and churn risk indicators.
- [ ] Validate analytics event correctness and de-duplication before launch.
- [ ] Build daily executive and live-ops reports with automated delivery.

## Documentation and Governance
- [ ] Update architecture docs to reflect current production topology and queue ownership boundaries.
- [ ] Document all launch feature flags and rollback toggles with owners.
- [ ] Freeze launch scope and create explicit post-launch backlog split.
- [ ] Hold final go/no-go review with Engineering, Product, Operations, and Support stakeholders.

## Launch Exit Criteria
- [ ] No sev-1 or sev-2 unresolved defects in launch-critical flows.
- [ ] All production secrets configured and verified in staging parity checks.
- [ ] End-to-end deploy, rollback, and restore rehearsal completed within target time windows.
- [ ] Core KPI dashboards and paging alerts confirmed live before traffic cutover.
- [ ] Stakeholder sign-off captured for launch decision.

## Notes
This checklist is intentionally strict. If any item remains unchecked, production launch risk increases and should be explicitly accepted by stakeholders.
