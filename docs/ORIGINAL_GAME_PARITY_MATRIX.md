# Original Game Parity Matrix (Step 1)

Date: 2026-02-25
Scope: Web client (`apps/web/src/main.tsx`) + API (`services/api/src/index.ts`) + tick server (`services/game-server/src/index.ts`)
Goal: Identify what remains to match original game behavior and depth.

## Status Key
- `Done`: implemented and usable end-to-end
- `Partial`: implemented but not at original depth/coverage
- `Missing`: not implemented or only placeholder

## Executive Summary
- Estimated parity right now: `~45%`
- Biggest gaps to original feel: missing gameplay modules in UI, partial alliance/depth systems, no forum flow, no holy-circle/guildhall gameplay, no marketplace system, and no unified low-latency client sync architecture.

## Feature Matrix
| System | Original Game Expectation | Current State | Status | Gap to Close |
|---|---|---|---|---|
| Auth/Login/Register | Email/password auth and account flow | API auth endpoints + login/register gate in web | Partial | Add reset-password, email verification, rate limit, session refresh UX |
| Overview | Kingdom dashboard with rich stats and world state | Implemented with major stats and actions | Partial | Increase depth, align all original metrics and widgets |
| Buildings | Build queue, costs, scaling, detailed effects | Implemented with queue + costs | Partial | Match full original balancing/details and edge-case rules |
| War Room (attack/spy/explore) | Full combat flow, return timers, reports | Implemented core attack/spy/explore + reports | Partial | Match original combat nuance, intel depth, UI density |
| Train Troops | Train with prereqs/costs/timers | Implemented | Partial | Merge into integrated military UX and match original utility actions |
| Research | Skill tree, prerequisites, queue | Implemented | Partial | Match full tree behavior and all original modifiers/effects |
| Settlements | Build/upgrade/destroy/found/history/garrison | Implemented core flows | Partial | Add full original settlement depth and UI polish parity |
| Alliance core | Create/join/leave/relation/contribute | API + UI present | Partial | Add rank permissions, declare-war flow, invite/accept flow parity |
| Alliance Forums | Forum list/threads/posts | Nav exists, no real UI/module wired | Missing | Build full forum module and API workflows |
| Embassy | Diplomatic hub interactions | Nav exists, placeholder only | Missing | Implement embassy gameplay and related APIs |
| Marketplace | Trading/economy exchange features | Nav exists, placeholder only | Missing | Implement market orders, listings, fulfillment, logs |
| Guildhall | Covert/spy support systems | Nav exists, placeholder only | Missing | Implement guildhall gameplay and progression |
| Holy Circle | Religion/mana/spell systems | Nav exists, placeholder only | Missing | Implement holy-circle systems and UI |
| Rankings | Kingdom/alliance leaderboards and trend views | API exists, UI route currently placeholder | Partial | Wire leaderboard UI and filters/history parity |
| Pigeons/Messages | Inbox/outbox/message read/send/search | API exists, UI route currently placeholder | Partial | Build complete mail UX and search/thread parity |
| Account screen | Account profile/settings/subscription area | Nav exists, placeholder only | Missing | Implement account/profile/settings pages and controls |
| Tick engine reliability | Deterministic, idempotent tick progression | Core tick loops implemented | Partial | Add idempotency proofs, drift tests, replay-safe guarantees |
| Real-time sync performance | Fast low-latency updates without lag | Per-view polling architecture | Partial | Replace with unified sync model (SSE/WebSocket or batched polling) |
| Observability/perf guardrails | Metrics/alerts/perf budgets | Minimal | Missing | Add p95 latency/tick metrics, alerts, and CI perf checks |

## Route Parity Snapshot (Web)
| Route/Menu Item | Current |
|---|---|
| Overview | Implemented |
| Buildings | Implemented |
| War Room | Implemented |
| Train Troops | Implemented |
| Attack Kingdom | Implemented |
| Alliance | Implemented (partial depth) |
| Research | Implemented |
| Settlements | Implemented (partial depth) |
| Rankings | Placeholder |
| Pigeons | Placeholder |
| Guildhall | Placeholder |
| Holy Circle | Placeholder |
| Alliance Forums | Placeholder |
| Embassy | Placeholder |
| Marketplace | Placeholder |
| Account | Placeholder |

## API Coverage Snapshot
Implemented APIs exist for:
- auth
- kingdom core/build/train/disband/tax/shield/daily bonus
- war-room attack/explore/spy/reports
- rankings + NW history
- pigeons + notifications
- research
- settlements
- alliance core

Primary missing API domains for parity:
- alliance forums
- embassy gameplay
- marketplace trading engine
- holy-circle systems
- guildhall-specific systems
- account management endpoints (profile/settings/recovery)

## Step 1 Exit Criteria
- `Done`: parity matrix created with clear done/partial/missing by module.
- `Done`: missing systems prioritized in execution order.
- `Done`: measurable quality/performance criteria defined for later steps.

## Priority Order for Step 2+
1. Tick engine hardening and formula parity lock
2. Unified real-time client sync model (reduce lag)
3. Implement missing gameplay modules in this order:
   1. Rankings + Pigeons full UI wiring
   2. Alliance Forums
   3. Embassy
   4. Marketplace
   5. Guildhall
   6. Holy Circle
   7. Account page
4. Visual/UI parity pass to match original depth and polish
5. Performance and observability hardening

## Performance Targets (Used in later steps)
- API p95 under 120ms on common read paths
- Tick loop p95 under 200ms at target kingdom count
- No duplicate or missed queue completion across restart/recovery scenarios
- Client interactions feel sub-100ms for local state changes

