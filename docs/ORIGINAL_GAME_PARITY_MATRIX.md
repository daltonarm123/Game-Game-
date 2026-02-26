# Original Game Parity Matrix

Date: 2026-02-26  
Scope: `apps/web`, `services/api`, `services/game-server`

## Status Key
- `Done`: implemented and playable end-to-end
- `Partial`: implemented, but still behind original game depth/reliability
- `Missing`: not implemented

## Executive Snapshot
- Estimated parity: `~72%`
- Biggest remaining gaps:
  - forum depth is now thread/post capable, but still lacks moderation/permissions/search tooling
  - embassy/guildhall/holy-circle are functional but not full original depth/balance breadth
  - real-time is now SSE push-enabled, but not yet a full authoritative low-latency event architecture
  - observability is basic (in-app metrics endpoint only), not production-grade live-ops
  - automated tests now exist across packages, but coverage is still foundational

## Feature Matrix
| System | Current State | Status | Remaining Gap |
|---|---|---|---|
| Auth/Login/Register | login/register/sessions/forgot/reset/referrals present | Partial | deeper abuse controls, richer account security UX |
| Overview/Buildings/Research/War/Settlements | core gameplay loops implemented | Partial | deeper balancing and edge-case parity |
| Alliance Core | create/join/leave/relation/contributions present | Partial | rank-based permissions and richer diplomacy workflows |
| Alliance Forums | dedicated API + thread/post UI shipped | Partial | moderation roles, pin/lock controls in UI, search/history tooling |
| Embassy | mission send/respond + inbox/outbox style panel shipped | Partial | richer treaty mechanics and long-running diplomatic effects |
| Guildhall | train/spy plus sabotage mission flow shipped | Partial | more covert mission types and counter-intel depth |
| Holy Circle | prayer lifecycle + instant spell-cast + cast history shipped | Partial | expanded spellbook, effects stacking/counters, balancing pass |
| Marketplace | listing/buy/history APIs + UI present | Partial | deeper market dynamics and anti-abuse economics |
| Rankings | kingdoms + alliances tabs live | Done | trend/history views still optional enhancement |
| Pigeons/Messages | inbox/outbox/send/read UX live | Partial | threading/search/filtering parity |
| Real-time Sync | SSE stream endpoint + client subscriptions on key views | Partial | move from refresh-push to granular domain events and consistency contracts |
| Tick Catch-up Reliability | per-tick `worker_last_tick_at` update + stale backlog skip on cap | Done | long-run soak tests under production load |
| Observability | admin metrics endpoint (latency percentiles/error rates/budget check) | Partial | external metrics pipeline, dashboards, alerts, SLO automation |
| Automated Tests | package test suites now run real unit tests (not just build) | Partial | API integration + E2E + broader scenario coverage |

## API Domain Snapshot
Implemented:
- alliance forums (`/api/alliance-forums/...`)
- embassy missions (`/api/embassy/...`)
- guildhall sabotage (`/api/guildhall/:kingdom/sabotage`)
- holy circle cast (`/api/pray/:kingdom/cast`)
- rankings alliances (`/api/rankings/alliances`)
- SSE stream (`/api/stream/:kingdom`)
- admin metrics (`/api/admin/metrics`)

Still shallow vs full parity:
- forum moderation/search tools
- expanded diplomatic, guild, and religion effect systems
- richer live-ops and anti-abuse control surfaces

## Web Route Snapshot
| Route | Current |
|---|---|
| Rankings | Kingdom + Alliance tabs implemented |
| Pigeons | Implemented |
| Alliance Forums | Implemented |
| Guildhall | Implemented |
| Holy Circle | Implemented |
| Embassy | Implemented |
| Account | Implemented (referral code surfaced) |

## Testing Snapshot
Current automated tests include:
- API gameplay math/unit tests
- Game-server catch-up planner/unit tests
- Web view-model unit tests

Remaining:
- API integration tests against transient DB
- cross-service combat/tick determinism scenario tests
- browser E2E coverage for high-value user journeys

## Immediate Next Milestones
1. Add integration-test harness for API endpoints (forums/embassy/guildhall/pray cast).
2. Add event-contract tests for SSE update behavior.
3. Expand gameplay depth for embassy/guildhall/holy-circle with balancing tables.
4. Wire production observability stack (metrics backend + alerts + dashboards).
