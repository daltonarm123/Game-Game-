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

## Timing and Shield Configuration

- `TICK_INTERVAL_SECONDS` controls server tick cadence.
- `SEASON_LENGTH_SECONDS` controls season duration.
- `SHIELD_COOLDOWN_SECONDS` controls cooldown duration after a shield ends or is cancelled.

Season countdowns in API responses are derived from season start + wall clock, so UI timers stay accurate even if worker execution is temporarily delayed.

## Naval Operations Configuration

These settings control standing navy economics and pirate event pressure in the game-server worker:

- `CHANNEL_UPKEEP_GOLD_PER_HOUR` (default: `680`)
- `CHANNEL_TRAFFIC_GOLD_PER_HOUR` (default: `1450`)
- `PIRATE_TICK_CHANCE` (default: `0.018`)
- `PIRATE_MIN_POWER` (default: `260`)
- `PIRATE_MAX_POWER` (default: `1500`)

Recommended tuning approach:

1. Change only one variable group at a time (channel economy or pirate pressure).
2. Run for at least one full day/night cycle.
3. Compare before/after values in admin metrics plus player support reports.
4. Keep pirate raid outcomes mixed (not always breached, not always repelled).

## Naval Post-Deploy Verification

After API restart or schema migration deployment:

1. Confirm API startup logs contain no `boat_types` migration errors.
2. Run integration validation against transient Postgres:
  - `bash scripts/run-api-integration-with-transient-db.sh`
3. Validate in live environment with two kingdoms:
  - queue and complete at least one boat build
  - create and accept one naval barter offer
  - capture one sea channel and set toll/closure policy
  - verify closed channel blocks third-party ship transfer
4. Confirm worker tick log shows naval processors:
  - `barter_expired=...`
  - `channels=...`
  - `pirate_raids=...`

## Naval Smoke Command

Run a one-command naval smoke pass:

1. Base health only:
  - `npm run smoke:naval`
2. Full admin-backed checks:
  - `API_BASE=https://your-api.example.com ADMIN_TOKEN=<admin-token> npm run smoke:naval`

Admin-backed mode validates:

- `GET /api/admin/backlog` and `GET /api/admin/alerts`
- worker lag threshold (`<= 600s`)
- due naval jobs are zero (`boats`, `shipments`, `barterOffers`)

## Admin Naval Checklist (Dashboard)

The Admin Panel Overview now includes a compact `Naval Health Checklist` card with:

- worker lag under 10 minutes
- boat queue due jobs
- shipment due jobs
- barter expiry due jobs
- controlled vs closed channels
- pirate raids and breached raids over last 6 hours

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

## Security Rotation

- Secret rotation runbook:
  - `docs/SECURITY_SECRETS_ROTATION.md`

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
