# Operations Runbook

## Health Checks

- API liveness: `GET /healthz`
- API readiness: `GET /readyz`
- Admin metrics: `GET /api/admin/metrics`
- Admin alerts: `GET /api/admin/alerts`
- Queue backlog: `GET /api/admin/backlog`

## Hidden Admin Monitor Account

Provision an invisible admin login by setting all four environment variables before the API starts:

- `HIDDEN_ADMIN_USERNAME`
- `HIDDEN_ADMIN_EMAIL`
- `HIDDEN_ADMIN_PASSWORD`
- `HIDDEN_ADMIN_KINGDOM`

On boot, the API creates or updates that user as `is_admin=true` and `hidden_from_players=true`. Hidden admin kingdoms remain visible in admin endpoints, but are excluded from public kingdom search, rankings, and direct attack/spy/sabotage targeting.

## Integrity Reconcile (Admin)

Run as admin from browser console with auth token:

- Land/building integrity:
  - `POST /api/admin/reconcile-land`
- Population/housing integrity:
  - `POST /api/admin/reconcile-population`
- Spy capacity integrity:
  - `POST /api/admin/reconcile-spy-capacity`
- Legacy train queue time repair:
  - `POST /api/admin/reconcile-train-queue-times`

All reconcile endpoints support `dryRun: true` first.

## Backups

### Create backup

```powershell
./scripts/backup-db.ps1
```

Optional:

```powershell
./scripts/backup-db.ps1 -OutDir .\backups -DatabaseUrl "<postgres-url>"
```

### Restore backup

```powershell
./scripts/restore-db.ps1 -BackupFile .\backups\crownforge-YYYYMMDD-HHMMSS.dump
```

## Deploy Verification Checklist

1. Deploy API + game-server + web from latest `main`.
2. Check `GET /healthz` and `GET /readyz`.
3. Check `GET /api/admin/backlog` for excessive due queues.
4. Run reconcile endpoints in `dryRun` and inspect output.
5. Validate core gameplay:
   - Build queue
   - Train queue
   - Attack report losses
   - Explore yield scaling
6. If critical regression, rollback to previous stable commit and restore DB backup if needed.

## Rollback

1. Redeploy previous known-good commit.
2. Restore DB only if data corruption occurred.
3. Re-run health and backlog checks.
4. Announce maintenance complete.
