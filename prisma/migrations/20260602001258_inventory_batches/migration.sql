-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('RECEIVED', 'DEPLETED', 'VOIDED');

-- CreateEnum
CREATE TYPE "BatchEventType" AS ENUM ('RECEIVED', 'ADJUSTED', 'LABELS_PRINTED', 'ALLOCATED', 'VOIDED');

-- AlterEnum
ALTER TYPE "InventoryAdjustmentReason" ADD VALUE 'RECEIPT';

-- CreateTable
CREATE TABLE "InventoryBatch" (
    "id" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "dose" TEXT NOT NULL,
    "vialSize" TEXT,
    "purity" TEXT NOT NULL DEFAULT '99%HPLC',
    "bud" TIMESTAMP(3) NOT NULL,
    "receivedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "qtyReceived" INTEGER NOT NULL,
    "qtyDamaged" INTEGER NOT NULL DEFAULT 0,
    "qtyOnHand" INTEGER NOT NULL,
    "yearColor" TEXT,
    "notes" TEXT,
    "status" "BatchStatus" NOT NULL DEFAULT 'RECEIVED',
    "receivedById" TEXT,
    "receivedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBatchEvent" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "type" "BatchEventType" NOT NULL,
    "delta" INTEGER,
    "note" TEXT,
    "performedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryBatchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBatch_batchNumber_key" ON "InventoryBatch"("batchNumber");

-- CreateIndex
CREATE INDEX "InventoryBatch_variantId_idx" ON "InventoryBatch"("variantId");

-- CreateIndex
CREATE INDEX "InventoryBatch_status_idx" ON "InventoryBatch"("status");

-- CreateIndex
CREATE INDEX "InventoryBatch_bud_idx" ON "InventoryBatch"("bud");

-- CreateIndex
CREATE INDEX "InventoryBatchEvent_batchId_idx" ON "InventoryBatchEvent"("batchId");

-- AddForeignKey
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBatchEvent" ADD CONSTRAINT "InventoryBatchEvent_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
