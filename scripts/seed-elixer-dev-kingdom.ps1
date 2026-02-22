param(
  [string]$ApiBase = "http://localhost:8080"
)

$ErrorActionPreference = "Stop"

Write-Host "==> Creating full dev kingdom seed (Elixer)..." -ForegroundColor Cyan

$body = @{
  attackerName = "Elixer"
  defenderName = "Galileo"
  attackerUserId = "u1"
  defenderUserId = "u2"
  attackerUsername = "envy90"
  defenderUsername = "zoo"
} | ConvertTo-Json -Compress

$res = Invoke-RestMethod -Method Post -Uri "$ApiBase/api/dev/demo-reset" -ContentType "application/json" -Body $body
if (-not $res.ok) { throw "Failed to seed dev kingdom." }

Write-Host "Dev kingdom ready." -ForegroundColor Green
Write-Host "Run these to validate production:"
Write-Host "  Invoke-RestMethod -Method Get -Uri `"$ApiBase/api/kingdom/Elixer`" | ConvertTo-Json -Depth 6"
Write-Host "  Invoke-RestMethod -Method Get -Uri `"$ApiBase/api/war-room/Elixer`" | ConvertTo-Json -Depth 6"

