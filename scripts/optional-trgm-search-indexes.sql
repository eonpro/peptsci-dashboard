-- OPTIONAL: Trigram (pg_trgm) indexes for case-insensitive substring search.
-- ---------------------------------------------------------------------------
-- Speeds up the `contains … mode:'insensitive'` (ILIKE '%term%') filters in
-- GET /api/admin/orders (app/api/admin/orders/route.ts), which currently do a
-- sequential scan on Order.trackingNumber and Client.organizationName.
--
-- WHY THIS IS A SEPARATE SCRIPT (not a Prisma migration):
--   1. CREATE EXTENSION requires elevated privileges (rds_superuser on RDS).
--      The app's runtime DB role / the /api/admin/db/migrate runner may NOT
--      have this, and a failure there would abort the migrate run.
--   2. GIN trigram indexes aren't cleanly expressible via Prisma `@@index`,
--      so committing them as a migration would create schema drift.
--
-- WHEN TO RUN: only once order/client volume makes the ILIKE search feel slow
-- (not needed at MVP scale). Run manually via psql as a privileged role:
--
--   psql "$ADMIN_DATABASE_URL" -f scripts/optional-trgm-search-indexes.sql
--
-- All statements are idempotent (IF NOT EXISTS) and use CONCURRENTLY so they
-- do NOT lock the table during creation. NOTE: CREATE INDEX CONCURRENTLY cannot
-- run inside a transaction block — run this file with psql's default autocommit
-- (do not wrap in BEGIN/COMMIT).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Order_trackingNumber_trgm_idx"
  ON "Order" USING gin ("trackingNumber" gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Client_organizationName_trgm_idx"
  ON "Client" USING gin ("organizationName" gin_trgm_ops);
