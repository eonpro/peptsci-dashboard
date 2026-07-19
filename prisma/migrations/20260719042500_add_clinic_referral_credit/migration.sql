-- CreateEnum
CREATE TYPE "ClientCreditKind" AS ENUM ('EARNED', 'REVERSED', 'REDEEMED', 'UNREDEEMED', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referredByClientId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "creditApplied" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ClientCreditEntry" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "kind" "ClientCreditKind" NOT NULL,
    "sourceClientId" TEXT,
    "orderId" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientCreditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientCreditEntry_reference_key" ON "ClientCreditEntry"("reference");

-- CreateIndex
CREATE INDEX "ClientCreditEntry_clientId_createdAt_idx" ON "ClientCreditEntry"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "ClientCreditEntry_orderId_idx" ON "ClientCreditEntry"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_referralCode_key" ON "Client"("referralCode");

-- CreateIndex
CREATE INDEX "Client_referredByClientId_idx" ON "Client"("referredByClientId");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_referredByClientId_fkey" FOREIGN KEY ("referredByClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCreditEntry" ADD CONSTRAINT "ClientCreditEntry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCreditEntry" ADD CONSTRAINT "ClientCreditEntry_sourceClientId_fkey" FOREIGN KEY ("sourceClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCreditEntry" ADD CONSTRAINT "ClientCreditEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

