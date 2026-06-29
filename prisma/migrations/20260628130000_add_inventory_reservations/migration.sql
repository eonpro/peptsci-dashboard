-- Inventory reservations: ProductVariant.inventoryReserved counter +
-- InventoryReservation ledger (order-linked stock commitments) and the
-- ReservationStatus enum. Availability for new orders is
-- (inventoryOnHand - inventoryReserved).
--
-- Idempotent for the runtime migration runner (POST /api/admin/db/migrate),
-- which splits on ';' and skips "already exists"/"does not exist"/"duplicate".
-- No dollar-quoted (DO $$) blocks.

CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'CONSUMED');

ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "inventoryReserved" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "InventoryReservation" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "orderItemId" TEXT,
  "quantity" INTEGER NOT NULL,
  "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  CONSTRAINT "InventoryReservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "InventoryReservation_orderId_variantId_key" ON "InventoryReservation"("orderId", "variantId");
CREATE INDEX IF NOT EXISTS "InventoryReservation_variantId_idx" ON "InventoryReservation"("variantId");
CREATE INDEX IF NOT EXISTS "InventoryReservation_status_idx" ON "InventoryReservation"("status");

ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
