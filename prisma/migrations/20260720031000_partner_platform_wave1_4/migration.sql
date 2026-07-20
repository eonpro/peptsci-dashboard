-- CreateEnum
CREATE TYPE "PartnerLeadStatus" AS ENUM ('NEW', 'WORKING', 'CONVERTED', 'LOST', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PartnerPayoutRequestStatus" AS ENUM ('PENDING', 'COMPLETED', 'DECLINED');

-- CreateEnum
CREATE TYPE "PartnerAssetKind" AS ENUM ('IMAGE', 'DOCUMENT', 'COPY');

-- AlterTable
ALTER TABLE "PartnerOrg" ADD COLUMN     "autoApproveEntries" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "holdDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "notifyByEmail" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "partnerRefCode" TEXT,
ADD COLUMN     "payoutMinimumCents" INTEGER NOT NULL DEFAULT 5000,
ADD COLUMN     "referredByOrgId" TEXT,
ADD COLUMN     "teamJoinCode" TEXT,
ADD COLUMN     "w9BlobUrl" TEXT,
ADD COLUMN     "w9FileName" TEXT,
ADD COLUMN     "w9UploadedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PartnerLead" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "repId" TEXT,
    "clinicName" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "npiNumber" TEXT,
    "notes" TEXT,
    "status" "PartnerLeadStatus" NOT NULL DEFAULT 'NEW',
    "protectedUntil" TIMESTAMP(3) NOT NULL,
    "matchedClientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralLinkClick" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "refererHost" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "visitorHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralLinkClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerPayoutRequest" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "repId" TEXT,
    "payee" "CommissionPayee" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "PartnerPayoutRequestStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "requestedBy" TEXT NOT NULL,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerPayoutRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerRateTier" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "thresholdCents" INTEGER NOT NULL,
    "bonusBps" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerRateTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerAsset" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" "PartnerAssetKind" NOT NULL,
    "blobUrl" TEXT,
    "fileName" TEXT,
    "contentType" TEXT,
    "copyText" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartnerLead_orgId_status_idx" ON "PartnerLead"("orgId", "status");

-- CreateIndex
CREATE INDEX "PartnerLead_email_idx" ON "PartnerLead"("email");

-- CreateIndex
CREATE INDEX "PartnerLead_npiNumber_idx" ON "PartnerLead"("npiNumber");

-- CreateIndex
CREATE INDEX "ReferralLinkClick_linkId_createdAt_idx" ON "ReferralLinkClick"("linkId", "createdAt");

-- CreateIndex
CREATE INDEX "PartnerPayoutRequest_status_idx" ON "PartnerPayoutRequest"("status");

-- CreateIndex
CREATE INDEX "PartnerPayoutRequest_orgId_idx" ON "PartnerPayoutRequest"("orgId");

-- CreateIndex
CREATE INDEX "PartnerRateTier_orgId_idx" ON "PartnerRateTier"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerRateTier_orgId_thresholdCents_key" ON "PartnerRateTier"("orgId", "thresholdCents");

-- CreateIndex
CREATE INDEX "PartnerAsset_isActive_idx" ON "PartnerAsset"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerOrg_teamJoinCode_key" ON "PartnerOrg"("teamJoinCode");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerOrg_partnerRefCode_key" ON "PartnerOrg"("partnerRefCode");

-- AddForeignKey
ALTER TABLE "PartnerOrg" ADD CONSTRAINT "PartnerOrg_referredByOrgId_fkey" FOREIGN KEY ("referredByOrgId") REFERENCES "PartnerOrg"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerLead" ADD CONSTRAINT "PartnerLead_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "PartnerOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerLead" ADD CONSTRAINT "PartnerLead_repId_fkey" FOREIGN KEY ("repId") REFERENCES "PartnerRep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerLead" ADD CONSTRAINT "PartnerLead_matchedClientId_fkey" FOREIGN KEY ("matchedClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralLinkClick" ADD CONSTRAINT "ReferralLinkClick_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "ReferralLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerPayoutRequest" ADD CONSTRAINT "PartnerPayoutRequest_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "PartnerOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerPayoutRequest" ADD CONSTRAINT "PartnerPayoutRequest_repId_fkey" FOREIGN KEY ("repId") REFERENCES "PartnerRep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerRateTier" ADD CONSTRAINT "PartnerRateTier_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "PartnerOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

