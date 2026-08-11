-- Guided fulfillment wizard: per-order step cursor plus the audit trail of how
-- each box was built (documents printed vs done by hand, photo skipped, who
-- marked it fulfilled).
-- Plain statements only — the admin migrate runner splits on `;` and cannot
-- execute dollar-quoted DO $$ ... $$ blocks.

-- CreateEnum (re-run skips via ignorable "already exists")
CREATE TYPE "FulfillmentStep" AS ENUM ('VERIFY', 'VIAL_LABELS', 'PACKING_SLIP', 'PHOTO', 'SHIP', 'REVIEW', 'COMPLETE');

-- AlterTable OrderFulfillment
-- `step` stays NULL for orders started under the old pick/pack buttons; those
-- resume from `stage`, so no backfill is required.
ALTER TABLE "OrderFulfillment" ADD COLUMN IF NOT EXISTS "step" "FulfillmentStep";
ALTER TABLE "OrderFulfillment" ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3);
ALTER TABLE "OrderFulfillment" ADD COLUMN IF NOT EXISTS "startedById" TEXT;
ALTER TABLE "OrderFulfillment" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3);
ALTER TABLE "OrderFulfillment" ADD COLUMN IF NOT EXISTS "vialLabelsAt" TIMESTAMP(3);
ALTER TABLE "OrderFulfillment" ADD COLUMN IF NOT EXISTS "vialLabelsManual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OrderFulfillment" ADD COLUMN IF NOT EXISTS "packingSlipAt" TIMESTAMP(3);
ALTER TABLE "OrderFulfillment" ADD COLUMN IF NOT EXISTS "packingSlipManual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OrderFulfillment" ADD COLUMN IF NOT EXISTS "photoSkippedAt" TIMESTAMP(3);
ALTER TABLE "OrderFulfillment" ADD COLUMN IF NOT EXISTS "photoSkippedById" TEXT;
ALTER TABLE "OrderFulfillment" ADD COLUMN IF NOT EXISTS "shipConfirmedAt" TIMESTAMP(3);
ALTER TABLE "OrderFulfillment" ADD COLUMN IF NOT EXISTS "fulfilledAt" TIMESTAMP(3);
ALTER TABLE "OrderFulfillment" ADD COLUMN IF NOT EXISTS "fulfilledById" TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS "OrderFulfillment_step_idx" ON "OrderFulfillment"("step");
