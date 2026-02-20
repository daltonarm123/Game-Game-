param(
  [string]$ApiBase = "http://localhost:8080",
  [switch]$SkipInfra
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm is required but was not found on PATH."
}

if (-not $SkipInfra) {
  if (Get-Command docker -ErrorAction SilentlyContinue) {
    Write-Host "==> Starting infra (Postgres + Redis)..." -ForegroundColor Cyan
    docker compose -f infra/docker-compose.yml up -d
  } else {
    Write-Warning "docker was not found. Skipping infra startup. Use -SkipInfra to hide this warning."
  }
}

Write-Host "==> Installing dependencies (npm install)..." -ForegroundColor Cyan
npm install

$wd = (Get-Location).Path

Write-Host "==> Starting API service..." -ForegroundColor Cyan
$apiCmd = "cd `"$wd`"; npm run dev -w @game-game/api"
Start-Process powershell -ArgumentList @('-NoExit','-Command',$apiCmd)

Write-Host "==> Starting tick worker service..." -ForegroundColor Cyan
$workerCmd = "cd `"$wd`"; npm run dev -w @game-game/game-server"
Start-Process powershell -ArgumentList @('-NoExit','-Command',$workerCmd)

Write-Host "==> Starting web app..." -ForegroundColor Cyan
$webCmd = "cd `"$wd`"; npm run dev -w @game-game/web"
Start-Process powershell -ArgumentList @('-NoExit','-Command',$webCmd)

Write-Host "==> Waiting for API health..." -ForegroundColor Cyan
$ok = $false
for ($i=0; $i -lt 30; $i++) {
  try {
    $r = Invoke-RestMethod -Method Get -Uri "$ApiBase/healthz" -TimeoutSec 2
    if ($r.ok -eq $true) { $ok = $true; break }
  } catch {}
  Start-Sleep -Seconds 1
}

if ($ok) {
  Write-Host "Demo environment is up." -ForegroundColor Green
  Write-Host "Web: http://localhost:5173"
  Write-Host "API: $ApiBase"
  Write-Host "Next: powershell -ExecutionPolicy Bypass -File .\scripts\seed-demo-data.ps1"
} else {
  Write-Warning "API did not report healthy yet. Check spawned terminal windows for errors."
}
