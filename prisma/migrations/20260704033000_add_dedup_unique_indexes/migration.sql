-- Durable dedup/uniqueness guarantees behind the app-level guards added with
-- the bug-fix pass:
--   1. Notification(userId, sourceType, sourceId) unique — racing cron runs /
--      webhook redeliveries can't double-notify (NULL source rows exempt).
--   2. InvoiceLineItem.orderId unique — an order can be billed on at most one
--      line item (voidInvoice NULLs orderId, freeing the slot).
--   3. AuditLog cron-marker partial unique — overlapping cron runs can't both
--      record a "sent" marker for the same period.
-- Each index is preceded by a cleanup that keeps the EARLIEST row so the index
-- can build on databases that already contain duplicates. Invoice lines are
-- UNLINKED (orderId = NULL), never deleted — billing amounts are untouched.

-- 1a. Remove duplicate dedupable notifications (keep the earliest).
DELETE FROM "Notification" n
USING "Notification" k
WHERE n."sourceType" IS NOT NULL
  AND n."sourceId" IS NOT NULL
  AND k."userId" = n."userId"
  AND k."sourceType" = n."sourceType"
  AND k."sourceId" = n."sourceId"
  AND (k."createdAt" < n."createdAt" OR (k."createdAt" = n."createdAt" AND k."id" < n."id"));

-- 1b. Unique dedup key (name matches Prisma's @@unique convention).
CREATE UNIQUE INDEX IF NOT EXISTS "Notification_userId_sourceType_sourceId_key"
  ON "Notification"("userId", "sourceType", "sourceId");

-- 2a0. Legacy cleanup: lines on already-VOID invoices must not hold the order
-- slot (voidInvoice now NULLs these going forward, but pre-fix voids didn't).
UPDATE "InvoiceLineItem" li
SET "orderId" = NULL
FROM "Invoice" i
WHERE li."invoiceId" = i."id"
  AND i."status" = 'VOID'
  AND li."orderId" IS NOT NULL;

-- 2a. Unlink duplicate order->line links (keep the earliest line's link).
UPDATE "InvoiceLineItem" li
SET "orderId" = NULL
WHERE li."orderId" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "InvoiceLineItem" k
    WHERE k."orderId" = li."orderId"
      AND (k."createdAt" < li."createdAt" OR (k."createdAt" = li."createdAt" AND k."id" < li."id"))
  );

-- 2b. One billed line per order (name matches Prisma's @unique convention).
CREATE UNIQUE INDEX IF NOT EXISTS "InvoiceLineItem_orderId_key"
  ON "InvoiceLineItem"("orderId");

-- 2c. The plain index is superseded by the unique one.
DROP INDEX IF EXISTS "InvoiceLineItem_orderId_idx";

-- 3a. Remove duplicate cron send-markers (keep the earliest).
DELETE FROM "AuditLog" a
USING "AuditLog" k
WHERE a."entity" LIKE 'cron:%'
  AND k."entity" = a."entity"
  AND k."entityId" = a."entityId"
  AND (k."createdAt" < a."createdAt" OR (k."createdAt" = a."createdAt" AND k."id" < a."id"));

-- 3b. Partial unique index scoped to cron markers only (regular audit rows are
-- unaffected). Partial indexes aren't expressible in schema.prisma; this is
-- intentionally SQL-only.
CREATE UNIQUE INDEX IF NOT EXISTS "AuditLog_cron_marker_key"
  ON "AuditLog"("entity", "entityId")
  WHERE "entity" LIKE 'cron:%';
