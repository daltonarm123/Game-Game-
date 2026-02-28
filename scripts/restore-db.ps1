param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,
  [string]$DatabaseUrl = $env:DATABASE_URL
)

if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  Write-Error "DATABASE_URL is required. Set env var or pass -DatabaseUrl."
  exit 1
}

if (-not (Test-Path $BackupFile)) {
  Write-Error "Backup file not found: $BackupFile"
  exit 1
}

if (-not (Get-Command pg_restore -ErrorAction SilentlyContinue)) {
  Write-Error "pg_restore not found. Install PostgreSQL client tools and retry."
  exit 1
}

Write-Warning "This will overwrite objects in the target database."
$confirm = Read-Host "Type RESTORE to continue"
if ($confirm -ne "RESTORE") {
  Write-Host "Restore cancelled."
  exit 0
}

Write-Host "Restoring backup: $BackupFile"
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DatabaseUrl" "$BackupFile"
if ($LASTEXITCODE -ne 0) {
  Write-Error "Restore failed."
  exit $LASTEXITCODE
}

Write-Host "Restore complete."
