-- AlterTable
ALTER TABLE "InventoryAdjustment" ADD COLUMN     "createdByName" TEXT;

-- CreateIndex
CREATE INDEX "InventoryAdjustment_createdAt_idx" ON "InventoryAdjustment"("createdAt");
