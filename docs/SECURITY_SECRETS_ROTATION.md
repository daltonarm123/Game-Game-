# Security Secrets Rotation

Status date: 2026-06-27
Owner: Engineering + Operations

## Scope
This runbook covers secret rotation for:
- API runtime secrets
- payment provider credentials
- database credentials
- email provider credentials
- hidden admin bootstrap credentials

## Secret Inventory
Minimum production secrets to track:
- DATABASE_URL
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET
- BREVO_API_KEY
- HIDDEN_ADMIN_USERNAME
- HIDDEN_ADMIN_EMAIL
- HIDDEN_ADMIN_PASSWORD
- HIDDEN_ADMIN_KINGDOM
- ALLOWED_ORIGIN

## Rotation Policy
- Critical provider keys (Stripe, DB, email): every 90 days or immediately on suspected leak.
- Admin bootstrap credentials: every 90 days.
- Emergency rotation: within 1 hour of incident declaration.

## Standard Rotation Procedure
1. Create new secret value in provider console (do not delete old value yet).
2. Store new value in secure secret manager.
3. Update staging environment with new secret.
4. Validate staging health and key flows:
   - health endpoints
   - auth/register/login
   - payment webhook signature handling
   - email send path
5. Deploy to production with overlapping validity (old + new where provider supports overlap).
6. Validate production health and key flows.
7. Remove old credential in provider console.
8. Record rotation in audit log/change record.

## Emergency Rotation Procedure
1. Freeze deployment pipeline except incident changes.
2. Rotate all potentially exposed secrets immediately.
3. Revoke old secrets.
4. Invalidate active auth sessions if auth secret compromise is suspected.
5. Confirm system health and attack containment.
6. Publish incident summary and follow-up actions.

## Verification Checklist
- /healthz is healthy after rotation.
- /readyz is healthy after rotation.
- Payment webhook signature verification passes.
- Email delivery test passes.
- Admin login works with expected hidden/admin controls.

## Notes
- Never print secrets in logs.
- Never commit secrets to repository.
- Use least privilege credentials for each environment.
