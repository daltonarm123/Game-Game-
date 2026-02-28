# Ruleset V1 (Crownforge)

This document defines the first public ruleset for Crownforge.

## Design Goals
- Keep gameplay familiar to existing kingdom-strategy players.
- Keep formulas transparent and easier to tune.
- Improve speed, reliability, and update cadence.

## 1) Core Loop (Same Feel)
- Tick-based economy.
- Build queue + troop training queue.
- Spy -> plan -> attack cycle.
- Alliances, diplomacy, markets, research, and settlements (phased rollout).

## 2) Tick Timing
- Global server-aligned ticks at 5-minute boundaries.
- Expected cadence: `:00, :05, :10, :15 ...`
- Queue completions resolve on/after due time during tick processing.

## 3) Economy (Close to Legacy)
- Core resources: Food, Gold, Stone, Wood (+ later Horses/Mana).
- Land is primary growth indicator.
- Tax rate affects income and growth pressure (later phase full model).
- Maintenance pressure exists for large building counts (later phase full model).

## 4) Networth (Close to Legacy, Explicit)
Initial baseline coefficients (tunable):
- Land: `0.04`
- Food: `0.0001`
- Gold: `0.0005`
- Stone: `0.0002`
- Wood: `0.0002`
- Horses: `0.00025`

## 5) Combat (Close, More Transparent)
- Attack/defense power are deterministic and logged in report metadata.
- RPS remains core:
  - Pikemen > Cavalry
  - Cavalry > Archers
  - Archers > Infantry
- Castles provide diminishing-return defensive bonus.
- Result bands are ratio-based and configurable.

## 6) Queues
- Building queue and training queue are first-class systems.
- Costs deducted at enqueue time.
- Completion processed by tick worker.
- Full return-time troop movement queue is planned in War Room phase 2.

## 7) Alliances / Diplomacy / Markets / Research / Settlements
- These systems remain in scope and are phased in to preserve stability.
- We keep equivalent strategic purpose but improve UX and clarity.

## 8) Seasons
- Four seasons with periodic modifiers.
- Seasonal effects are explicit and visible in UI.
- First release keeps season model simple, then expands toward full depth.

## 9) Premium
- Premium is convenience/insight focused.
- No pay-to-win direct stat multipliers.
- All premium effects must be documented and auditable.

## 10) What Is Intentionally Different
- Faster page/API performance targets.
- Cleaner reports and telemetry.
- Better admin/live-ops tooling.
- Frequent, smaller balance patches instead of long content droughts.

## 11) Balancing Policy
- All major formulas in config/constants.
- Known-hit telemetry and outcomes used for periodic tuning.
- Any material formula change gets release notes.

## 12) Versioning
- Ruleset version is tagged in release notes.
- Save-compatible changes are preferred; migrations are explicit when needed.
