param(
  [string]$ApiBase = "http://localhost:8080"
)

$ErrorActionPreference = "Stop"

function Post-Json {
  param(
    [string]$Url,
    [hashtable]$Body
  )
  return Invoke-RestMethod -Method Post -Uri $Url -ContentType "application/json" -Body ($Body | ConvertTo-Json -Compress)
}

Write-Host "==> Running demo smoke test..." -ForegroundColor Cyan

$health = Invoke-RestMethod -Method Get -Uri "$ApiBase/healthz"
if (-not $health.ok) { throw "API health check failed" }
Write-Host "Health OK" -ForegroundColor Green

Post-Json -Url "$ApiBase/api/dev/register" -Body @{ userId = "u1"; username = "envy90"; kingdomName = "Elixer" } | Out-Null
Post-Json -Url "$ApiBase/api/dev/register" -Body @{ userId = "u2"; username = "zoo"; kingdomName = "Galileo" } | Out-Null
Write-Host "Register OK" -ForegroundColor Green

Post-Json -Url "$ApiBase/api/kingdom/Elixer/train" -Body @{ troopCode = "heavy_cavalry"; quantity = 1000 } | Out-Null
Write-Host "Train queue OK" -ForegroundColor Green

$attack = Post-Json -Url "$ApiBase/api/war-room/Elixer/attack" -Body @{ defenderKingdom = "Galileo"; sentTroops = @{ heavy_cavalry = 100 } }
if (-not $attack.ok) { throw "Attack call failed" }
Write-Host ("Attack OK: " + $attack.result) -ForegroundColor Green

$war = Invoke-RestMethod -Method Get -Uri "$ApiBase/api/war-room/Elixer"
if (-not $war.ok) { throw "War room read failed" }
Write-Host "War room OK" -ForegroundColor Green

$reports = Invoke-RestMethod -Method Get -Uri "$ApiBase/api/war-room/reports/Elixer?limit=5"
if (-not $reports.ok) { throw "Reports read failed" }
Write-Host ("Reports OK: " + ($reports.items | Measure-Object).Count + " found") -ForegroundColor Green

Write-Host "Smoke test passed." -ForegroundColor Green
