param(
  [string]$OutDir = ".\backups",
  [string]$DatabaseUrl = $env:DATABASE_URL
)

if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  Write-Error "DATABASE_URL is required. Set env var or pass -DatabaseUrl."
  exit 1
}

if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
  Write-Error "pg_dump not found. Install PostgreSQL client tools and retry."
  exit 1
}

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$file = Join-Path $OutDir "crownforge-$timestamp.dump"

Write-Host "Creating backup: $file"
pg_dump --format=custom --no-owner --no-privileges --file="$file" "$DatabaseUrl"
if ($LASTEXITCODE -ne 0) {
  Write-Error "Backup failed."
  exit $LASTEXITCODE
}

Write-Host "Backup complete: $file"
