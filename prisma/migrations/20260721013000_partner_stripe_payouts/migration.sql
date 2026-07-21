-- AlterTable
ALTER TABLE "PartnerOrg" ADD COLUMN     "stripeConnectAccountId" TEXT,
ADD COLUMN     "stripePayoutsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PartnerPayout" ADD COLUMN     "stripeTransferId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PartnerOrg_stripeConnectAccountId_key" ON "PartnerOrg"("stripeConnectAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerPayout_stripeTransferId_key" ON "PartnerPayout"("stripeTransferId");

