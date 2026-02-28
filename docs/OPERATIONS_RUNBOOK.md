# Operations Runbook

## Health Checks

- API liveness: `GET /healthz`
- API readiness: `GET /readyz`
- Admin metrics: `GET /api/admin/metrics`
- Admin alerts: `GET /api/admin/alerts`
- Queue backlog: `GET /api/admin/backlog`

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
