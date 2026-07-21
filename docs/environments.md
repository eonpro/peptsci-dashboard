# Environments & staging runbook

How to run PeptSci Dashboard in each environment, and how to stand up a
**staging** environment so schema migrations and risky features are exercised
before they touch production.

## Current topology

| Environment | App | Database | Auth | Payments |
|---|---|---|---|---|
| Local dev | `next dev` | Docker Postgres (`peptsci-pg`, port 5433) | Clerk dev instance (or unconfigured fallback) | Stripe test key |
| Vercel Preview (per-PR) | auto deploy per branch | **none by default** — see below | Clerk dev keys (Preview scope) | Stripe test key |
| Production | peptsci.com | AWS RDS via IAM auth (`lib/db-url.ts`) | Clerk prod instance | Stripe live (Connect platform + connected account) |

Production migrations are applied through the in-app runner
(`POST /api/admin/db/migrate`, SUPER_ADMIN + `{ "confirm": true }`) because the
Prisma CLI cannot mint RDS IAM tokens. The runner's `GET` reports schema
probes; `upToDate: true` is the authority that a deploy's migrations landed.

## Standing up staging (one-time)

Goal: previews (or a dedicated `staging` branch) run against their **own**
database with migrations applied by the Prisma CLI, so `main` deploys are the
second time a migration runs, not the first.

1. **Create a staging database.** Any managed Postgres works; Neon or Prisma
   Postgres are the low-friction options (free tier, connection string auth —
   no IAM complexity). Keep it in the same region as Vercel functions
   (`iad1` unless changed).
2. **Vercel env vars (Preview scope).** In the Vercel project settings add to
   the *Preview* environment:
   - `DATABASE_URL` → the staging connection string (this bypasses the PG*/IAM
     path in `lib/db-url.ts`)
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` → Clerk **dev
     instance** keys (never prod)
   - `STRIPE_SECRET_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` → **test mode**
     keys; leave `STRIPE_CONNECTED_ACCOUNT_ID` unset (falls back to the
     platform test account)
   - `NEXT_PUBLIC_APP_URL` → the preview URL is dynamic; leave the prod value,
     links in emails are the only consumer and email should stay off
   - Leave `EMAIL_ENABLED` / `SMS_ENABLED` unset (off) so staging never emails
     or texts real people
   - `CHECKOUT_ENFORCE_STOCK` — enforcement is ON by default; set `false` only
     if the staging DB has no inventory counts yet
3. **Apply migrations to staging.** From a local checkout:

   ```bash
   DATABASE_URL="<staging-url>" npx prisma migrate deploy
   ```

   This is the key difference from prod: the CLI works here, so migrations are
   rehearsed exactly as written before the in-app runner replays them in prod.
4. **Seed catalog data** (optional but recommended so the shop renders):

   ```bash
   DATABASE_URL="<staging-url>" ALLOW_REMOTE_SEED=1 npm run seed
   DATABASE_URL="<staging-url>" ALLOW_REMOTE_SEED=1 npm run seed:sci
   ```

   Seeds create products/variants and demo clients — **not** Clerk users. To
   test authed flows, sign up through the preview URL with the Clerk dev
   instance and approve the practice from `/clients`.

## Release flow with staging

1. Open a PR → CI runs typecheck/lint/unit + the Playwright smoke job (see
   below) → Vercel builds a preview against the staging DB.
2. New migration in the PR? Run `prisma migrate deploy` against staging first
   (step 3 above), then eyeball the preview.
3. Merge to `main` → production deploy.
4. Apply prod migrations via the in-app runner and confirm `upToDate: true`
   (see `.cursor/scratchpad.md` history for the SUPER_ADMIN session recipe).
5. Verify the touched surfaces on peptsci.com.

## CI e2e (GitHub Actions)

`.github/workflows/ci.yml` has an `e2e-smoke` job: disposable Postgres
service container → `prisma migrate deploy` → `next build` + `next start` →
`e2e/smoke.spec.ts`. It needs **test-instance** Clerk keys in repo secrets:

- `E2E_CLERK_PUBLISHABLE_KEY` / `E2E_CLERK_SECRET_KEY` (required — job
  no-ops with a notice when absent)
- `E2E_CLERK_EMAIL` / `E2E_CLERK_PASSWORD` (optional; unlocks
  `e2e/checkout.spec.ts` when pointed at a preview/staging URL — not run in
  the CI job because a fresh DB has no approved practice)

To run the full checkout spec against staging instead:

```bash
E2E_BASE_URL=https://<preview-url> E2E_CLERK_EMAIL=… E2E_CLERK_PASSWORD=… npm run test:e2e
```

## Hard rules

- Never point a preview/staging deploy at the production database.
- Never put Clerk prod keys or Stripe live keys in the Preview scope.
- Never run `prisma migrate reset` against a database with data (see the
  drift-repair lesson in `.cursor/scratchpad.md`: `migrate resolve --applied`).
- Staging data is disposable; prod data is not. If a migration needs data
  backfill, rehearse the backfill script on staging first.
