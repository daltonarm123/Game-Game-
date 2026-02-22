# Investor Demo Script (10 Minutes)

This script is designed for a live investor/backer demo with minimal setup risk.

## 0) Pre-demo Checklist (2-3 minutes before call)

1. Start demo environment:
   - `powershell -ExecutionPolicy Bypass -File .\scripts\start-demo-env.ps1`
2. Reset/seed demo kingdoms:
   - `powershell -ExecutionPolicy Bypass -File .\scripts\reset-demo.ps1`
   - `powershell -ExecutionPolicy Bypass -File .\scripts\seed-demo-data.ps1`
3. Open web app:
   - `http://localhost:5173`
4. Confirm API health:
   - `http://localhost:8080/healthz`
5. Keep fallback clip ready:
   - `docs/FALLBACK_VIDEO_SHOTLIST.md`

## 1) Demo Goal Statement (30 seconds)

"This is a modern rewrite of a tick-based kingdom war game. Today I’ll show the complete core loop: kingdom creation, training, combat, queue/tick behavior, and troop return tracking."

## 2) Exact Demo Flow (8-9 minutes)

### Step A: Show game shell and menus (1 minute)

1. Open web app.
2. Show these tabs:
   - `Overview`
   - `War Room`
   - `Train Troops`
   - `Attack Kingdom`
3. Explain this is intentionally close to legacy UX so players can switch easily.

Screenshot target:
- `A-01 Main navigation + themed shell`

### Step B: Show live kingdom data (1 minute)

Use API (PowerShell):

```powershell
$base = "http://localhost:8080"
Invoke-RestMethod -Method Get -Uri "$base/api/kingdom/Elixer"
Invoke-RestMethod -Method Get -Uri "$base/api/kingdom/Galileo"
```

Explain:
- resources
- troops
- queues
- server-backed state

Screenshot target:
- `B-01 Kingdom JSON response`

### Step C: Queue training from UI and API (2 minutes)

In UI:
1. Open `Train Troops`
2. Load `Elixer`
3. Queue `pikemen` (example: `1000`)

In API (optional visible proof):

```powershell
Invoke-RestMethod -Method Post -Uri "$base/api/kingdom/Elixer/train" -ContentType "application/json" -Body '{"troopCode":"pikemen","quantity":500}'
Invoke-RestMethod -Method Get -Uri "$base/api/war-room/Elixer"
```

Explain:
- queue adds to `train`
- tick worker processes completion on cadence

Screenshot targets:
- `C-01 Train Troops page with queued item`
- `C-02 War Room Home/Train/Away table`

### Step D: Launch an attack (2 minutes)

In UI:
1. Open `Attack Kingdom`
2. Attacker `Elixer`
3. Defender `Galileo`
4. Send sample troops and click `Launch Attack`

In API (optional exact proof):

```powershell
Invoke-RestMethod -Method Post -Uri "$base/api/war-room/Elixer/attack" -ContentType "application/json" -Body '{"defenderKingdom":"Galileo","sentTroops":{"heavy_cavalry":1000,"pikemen":250}}'
Invoke-RestMethod -Method Get -Uri "$base/api/war-room/reports/Elixer?limit=5"
```

Explain:
- combat result + ratio
- land taken
- persisted attack reports

Screenshot targets:
- `D-01 Attack Kingdom action`
- `D-02 Recent battle report list`

### Step E: Show troop movement lifecycle (2 minutes)

1. Open `War Room` for attacker.
2. Point out `Away` troops after attack.
3. Wait for return window or explain configured timer.
4. Refresh and show return from `away` back to `home`.

Explain:
- this is the core foundation for timing-based strategy gameplay

Screenshot target:
- `E-01 Away -> Home lifecycle evidence`

## 3) Close (30-45 seconds)

"We now have a playable vertical slice with persistent state, tick processing, war actions, and report tracking. Funding is used to expand content depth (research, alliance systems, full economy, mobile parity), not to start from scratch."

## 4) Appendix: Quick API Calls

```powershell
$base = "http://localhost:8080"

# health
Invoke-RestMethod -Method Get -Uri "$base/healthz"

# register kingdoms
Invoke-RestMethod -Method Post -Uri "$base/api/dev/register" -ContentType "application/json" -Body '{"userId":"u1","username":"envy90","kingdomName":"Elixer"}'
Invoke-RestMethod -Method Post -Uri "$base/api/dev/register" -ContentType "application/json" -Body '{"userId":"u2","username":"zoo","kingdomName":"Galileo"}'

# war room
Invoke-RestMethod -Method Get -Uri "$base/api/war-room/Elixer"
Invoke-RestMethod -Method Get -Uri "$base/api/war-room/reports/Elixer?limit=10"

# train
Invoke-RestMethod -Method Post -Uri "$base/api/kingdom/Elixer/train" -ContentType "application/json" -Body '{"troopCode":"pikemen","quantity":1000}'

# attack
Invoke-RestMethod -Method Post -Uri "$base/api/war-room/Elixer/attack" -ContentType "application/json" -Body '{"defenderKingdom":"Galileo","sentTroops":{"heavy_cavalry":1500}}'
```
