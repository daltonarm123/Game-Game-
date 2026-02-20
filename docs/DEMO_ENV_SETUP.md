# Live Demo Startup (Windows PowerShell)

## Full startup (recommended)

```powershell
cd C:\Users\dalto\OneDrive\Desktop\Game-Game-
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo-env.ps1
```

## If Docker is already running elsewhere

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo-env.ps1 -SkipInfra
```

## Seed demo data

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\seed-demo-data.ps1
```

## Run smoke test

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-test-demo.ps1
```

## Demo URLs

- Web: `http://localhost:5173`
- API Health: `http://localhost:8080/healthz`
