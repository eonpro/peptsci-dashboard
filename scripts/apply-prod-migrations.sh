#!/usr/bin/env bash
#
# Apply pending Prisma migrations to PRODUCTION RDS via the runtime runner.
# ---------------------------------------------------------------------------
# WHY THIS EXISTS
#   Production connects to RDS with short-lived IAM auth tokens minted at
#   runtime (see lib/db-url.ts), so the Prisma CLI cannot reach prod and
#   `prisma migrate deploy` can't run at build/deploy time. The admin-only
#   route POST /api/admin/db/migrate applies prisma/migrations through the
#   live (already-authenticated) runtime connection. It is idempotent —
#   "already exists" errors are treated as no-ops — so it is safe to re-run.
#
# PREREQUISITES
#   1. The new migration directory is committed AND DEPLOYED (the route reads
#      the SQL files traced into the function — see next.config.mjs
#      outputFileTracingIncludes is NOT needed for migrate; files ship via the
#      route bundle). Deploy first, then run this.
#   2. You are a logged-in ADMIN / SUPER_ADMIN (the route uses requireAdmin()).
#      Because auth is a Clerk session, the easiest auth is the `__session`
#      cookie from your authenticated browser session (see below).
#
# USAGE
#   BASE_URL=https://app.peptsci.com \
#   SESSION_COOKIE='__session=eyJ...' \
#   ./scripts/apply-prod-migrations.sh
#
#   # Status-only (no changes):
#   BASE_URL=... SESSION_COOKIE=... ./scripts/apply-prod-migrations.sh --status
#
# HOW TO GET SESSION_COOKIE
#   1. Sign in to the prod app as an admin in your browser.
#   2. DevTools → Application → Cookies → copy the `__session` value.
#   3. Pass it as SESSION_COOKIE='__session=<value>'.
#
# EASIEST ALTERNATIVE (no cookie copying) — run in the browser DevTools console
# while signed in as an admin on the prod domain:
#
#   // status
#   await fetch('/api/admin/db/migrate').then(r => r.json())
#   // apply
#   await fetch('/api/admin/db/migrate', {
#     method: 'POST',
#     headers: { 'Content-Type': 'application/json' },
#     body: JSON.stringify({ confirm: true }),
#   }).then(r => r.json())
#
set -euo pipefail

: "${BASE_URL:?Set BASE_URL, e.g. https://app.peptsci.com}"
: "${SESSION_COOKIE:?Set SESSION_COOKIE, e.g. '__session=eyJ...'}"

ENDPOINT="${BASE_URL%/}/api/admin/db/migrate"

echo "→ Checking migration status: GET ${ENDPOINT}"
curl -sS -H "Cookie: ${SESSION_COOKIE}" "${ENDPOINT}" | tee /tmp/peptsci-migrate-status.json
echo

if [[ "${1:-}" == "--status" ]]; then
  echo "Status-only mode — not applying. Re-run without --status to apply."
  exit 0
fi

echo "→ Applying migrations: POST ${ENDPOINT} { confirm: true }"
curl -sS -X POST \
  -H "Cookie: ${SESSION_COOKIE}" \
  -H "Content-Type: application/json" \
  -d '{"confirm":true}' \
  "${ENDPOINT}" | tee /tmp/peptsci-migrate-result.json
echo
echo "Done. Review the JSON above: each migration reports {statements, applied, skipped}."
echo "The new perf-index migration (20260603010000_add_perf_indexes) should report"
echo "its CREATE INDEX statements as applied (or skipped if already present)."
