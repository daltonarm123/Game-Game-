param(
  [string]$ApiBase = "http://localhost:8080",
  [string]$AttackerName = "Elixer",
  [string]$DefenderName = "Galileo"
)

$ErrorActionPreference = "Stop"

Write-Host "==> Resetting demo data..." -ForegroundColor Cyan
$body = @{
  attackerName = $AttackerName
  defenderName = $DefenderName
  attackerUserId = "u1"
  defenderUserId = "u2"
  attackerUsername = "envy90"
  defenderUsername = "zoo"
} | ConvertTo-Json -Compress

$res = Invoke-RestMethod -Method Post -Uri "$ApiBase/api/dev/demo-reset" -ContentType "application/json" -Body $body
if (-not $res.ok) { throw "Demo reset failed." }

Write-Host "Demo reset complete." -ForegroundColor Green
Write-Host "Attacker: $AttackerName | Defender: $DefenderName"
