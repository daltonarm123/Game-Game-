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

Write-Host "==> Seeding demo kingdoms..." -ForegroundColor Cyan
Post-Json -Url "$ApiBase/api/dev/register" -Body @{ userId = "u1"; username = "envy90"; kingdomName = "Elixer" } | Out-Null
Post-Json -Url "$ApiBase/api/dev/register" -Body @{ userId = "u2"; username = "zoo"; kingdomName = "Galileo" } | Out-Null

Write-Host "==> Queueing starter training..." -ForegroundColor Cyan
Post-Json -Url "$ApiBase/api/kingdom/Elixer/train" -Body @{ troopCode = "heavy_cavalry"; quantity = 3000 } | Out-Null
Post-Json -Url "$ApiBase/api/kingdom/Elixer/train" -Body @{ troopCode = "pikemen"; quantity = 1200 } | Out-Null
Post-Json -Url "$ApiBase/api/kingdom/Galileo/train" -Body @{ troopCode = "light_cavalry"; quantity = 2500 } | Out-Null

Write-Host "==> Queueing starter buildings..." -ForegroundColor Cyan
Post-Json -Url "$ApiBase/api/kingdom/Elixer/build" -Body @{ buildingCode = "farm" } | Out-Null
Post-Json -Url "$ApiBase/api/kingdom/Elixer/build" -Body @{ buildingCode = "castles" } | Out-Null
Post-Json -Url "$ApiBase/api/kingdom/Galileo/build" -Body @{ buildingCode = "farm" } | Out-Null

Write-Host "Seed complete. Verify with:" -ForegroundColor Green
Write-Host "  Invoke-RestMethod -Method Get -Uri \"$ApiBase/api/war-room/Elixer\""
Write-Host "  Invoke-RestMethod -Method Get -Uri \"$ApiBase/api/war-room/Galileo\""
