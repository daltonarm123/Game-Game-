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

Write-Host "==> Resetting and seeding demo kingdoms..." -ForegroundColor Cyan
Post-Json -Url "$ApiBase/api/dev/demo-reset" -Body @{
  attackerName = "Elixer"
  defenderName = "Galileo"
  attackerUserId = "u1"
  defenderUserId = "u2"
  attackerUsername = "envy90"
  defenderUsername = "zoo"
} | Out-Null

Write-Host "==> Queueing starter training..." -ForegroundColor Cyan
Post-Json -Url "$ApiBase/api/kingdom/Elixer/train" -Body @{ troopCode = "footmen"; quantity = 5 } | Out-Null
Post-Json -Url "$ApiBase/api/kingdom/Galileo/train" -Body @{ troopCode = "footmen"; quantity = 3 } | Out-Null

Write-Host "==> Queueing starter buildings..." -ForegroundColor Cyan
Post-Json -Url "$ApiBase/api/kingdom/Elixer/build" -Body @{ buildingCode = "farm" } | Out-Null
Post-Json -Url "$ApiBase/api/kingdom/Galileo/build" -Body @{ buildingCode = "farm" } | Out-Null

Write-Host "Seed complete. Verify with:" -ForegroundColor Green
Write-Host "  Invoke-RestMethod -Method Get -Uri \"$ApiBase/api/war-room/Elixer\""
Write-Host "  Invoke-RestMethod -Method Get -Uri \"$ApiBase/api/war-room/Galileo\""
