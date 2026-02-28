# Live Demo Startup (Windows PowerShell)

## Full startup (recommended)

```powershell
cd C:\path\to\Crownforge
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo-env.ps1
```

This automatically enables fast local demo mode:

- `LOCAL_DEMO_FAST=1`
- `FAST_BUILD_SECONDS=5`
- `FAST_TRAIN_SECONDS=5`
- `ATTACK_RETURN_SECONDS=20`
- `TICK_INTERVAL_SECONDS=5`
- `TICK_ALIGN_SECONDS=5`

## If Docker is already running elsewhere

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo-env.ps1 -SkipInfra
```

## Seed demo data

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\seed-demo-data.ps1
```

## One-click reset (before each meeting)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\reset-demo.ps1
```

## Full dev kingdom seed (Elixer)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\seed-elixer-dev-kingdom.ps1
```

## Run smoke test

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-test-demo.ps1
```

## Demo URLs

- Web: `http://localhost:5173`
- API Health: `http://localhost:8080/healthz`
