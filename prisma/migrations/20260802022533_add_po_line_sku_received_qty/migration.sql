-- AlterTable
ALTER TABLE "DistributorOrderLine" ADD COLUMN     "receivedQty" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sku" TEXT;

-- CreateIndex
CREATE INDEX "DistributorOrderLine_sku_idx" ON "DistributorOrderLine"("sku");
