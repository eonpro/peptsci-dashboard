-- Warehouse pick/pack fulfillment state for an order (OrderFulfillment, 1:1)
-- plus the FulfillmentStage enum. Tracks the pick → pack workflow distinct from
-- Order.status / shippingStatus.
--
-- Idempotent for the runtime migration runner (POST /api/admin/db/migrate),
-- which splits on ';' and skips "already exists"/"does not exist"/"duplicate".
-- No dollar-quoted (DO $$) blocks.

CREATE TYPE "FulfillmentStage" AS ENUM ('NOT_STARTED', 'PICKING', 'PICKED', 'PACKED');

CREATE TABLE IF NOT EXISTS "OrderFulfillment" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "stage" "FulfillmentStage" NOT NULL DEFAULT 'NOT_STARTED',
  "pickedAt" TIMESTAMP(3),
  "pickedById" TEXT,
  "packedAt" TIMESTAMP(3),
  "packedById" TEXT,
  "verifiedItems" JSONB,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderFulfillment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrderFulfillment_orderId_key" ON "OrderFulfillment"("orderId");
CREATE INDEX IF NOT EXISTS "OrderFulfillment_stage_idx" ON "OrderFulfillment"("stage");

ALTER TABLE "OrderFulfillment" ADD CONSTRAINT "OrderFulfillment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
