-- CreateEnum
CREATE TYPE "PartnerStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PartnerCompensationModel" AS ENUM ('COMMISSION', 'MARGIN');

-- CreateEnum
CREATE TYPE "CommissionPayee" AS ENUM ('ORG', 'REP');

-- CreateEnum
CREATE TYPE "CommissionEntryKind" AS ENUM ('EARNING', 'REVERSAL');

-- CreateEnum
CREATE TYPE "CommissionEntryStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID');

-- CreateEnum
CREATE TYPE "PartnerTransactionSource" AS ENUM ('ORDER', 'MANUAL', 'CSV');

-- CreateEnum
CREATE TYPE "PartnerOrgMemberRole" AS ENUM ('ADMIN', 'VIEWER');

-- CreateEnum
CREATE TYPE "PartnerClinicStage" AS ENUM ('LEAD', 'ACTIVE', 'AT_RISK', 'DORMANT');

-- CreateEnum
CREATE TYPE "PartnerClinicActivityType" AS ENUM ('NOTE', 'STAGE_CHANGE', 'TAG_CHANGE');

-- CreateEnum
CREATE TYPE "PartnerGoalMetric" AS ENUM ('REVENUE', 'COMMISSION');

-- CreateEnum
CREATE TYPE "PartnerGoalPeriod" AS ENUM ('MONTH', 'QUARTER', 'YEAR');

-- CreateEnum
CREATE TYPE "PartnerQuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'PARTNER';

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "partnerOrgId" TEXT,
ADD COLUMN     "partnerRepId" TEXT,
ADD COLUMN     "referralLinkId" TEXT;

-- CreateTable
CREATE TABLE "PartnerOrg" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "website" TEXT,
    "notes" TEXT,
    "status" "PartnerStatus" NOT NULL DEFAULT 'PENDING',
    "compensationModel" "PartnerCompensationModel" NOT NULL DEFAULT 'COMMISSION',
    "commissionRateBps" INTEGER NOT NULL DEFAULT 0,
    "msaSignedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerOrg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerRep" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "clerkUserId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "status" "PartnerStatus" NOT NULL DEFAULT 'PENDING',
    "commissionRateBps" INTEGER NOT NULL DEFAULT 0,
    "msaSignedAt" TIMESTAMP(3),
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerRep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerOrgMember" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "clerkUserId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "PartnerOrgMemberRole" NOT NULL DEFAULT 'VIEWER',
    "status" "PartnerStatus" NOT NULL DEFAULT 'ACTIVE',
    "invitedBy" TEXT,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerOrgMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralLink" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "repId" TEXT,
    "label" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "signupCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerTransaction" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "repId" TEXT,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "reference" TEXT,
    "revenueCents" INTEGER NOT NULL,
    "costCents" INTEGER,
    "refundedCents" INTEGER NOT NULL DEFAULT 0,
    "source" "PartnerTransactionSource" NOT NULL DEFAULT 'ORDER',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionEntry" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "repId" TEXT,
    "payee" "CommissionPayee" NOT NULL,
    "kind" "CommissionEntryKind" NOT NULL DEFAULT 'EARNING',
    "rateBps" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "CommissionEntryStatus" NOT NULL DEFAULT 'PENDING',
    "payoutId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerPayout" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "repId" TEXT,
    "payee" "CommissionPayee" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedBy" TEXT NOT NULL,
    "recordedByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerOrgPricing" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "floorCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerOrgPricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerAgreement" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "repId" TEXT,
    "signerKind" "CommissionPayee" NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "documentVersion" TEXT NOT NULL,
    "documentTitle" TEXT NOT NULL,
    "documentHash" TEXT NOT NULL,
    "documentText" TEXT NOT NULL,
    "legalEntityName" TEXT,
    "signerName" TEXT NOT NULL,
    "signerTitle" TEXT,
    "signerEmail" TEXT,
    "signatureImage" TEXT NOT NULL,
    "signedIp" TEXT,
    "signedUserAgent" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerClinicMeta" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "stage" "PartnerClinicStage" NOT NULL DEFAULT 'ACTIVE',
    "tags" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerClinicMeta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerClinicActivity" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "repId" TEXT,
    "actorKind" "CommissionPayee" NOT NULL,
    "actorName" TEXT,
    "type" "PartnerClinicActivityType" NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerClinicActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerGoal" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "repId" TEXT,
    "metric" "PartnerGoalMetric" NOT NULL,
    "period" "PartnerGoalPeriod" NOT NULL,
    "targetCents" INTEGER NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerQuote" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "repId" TEXT,
    "clinicName" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "items" JSONB NOT NULL DEFAULT '[]',
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "status" "PartnerQuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerApiKey" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerWebhook" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastDeliveryAt" TIMESTAMP(3),
    "lastStatus" INTEGER,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerOrg_clerkUserId_key" ON "PartnerOrg"("clerkUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerOrg_contactEmail_key" ON "PartnerOrg"("contactEmail");

-- CreateIndex
CREATE INDEX "PartnerOrg_status_idx" ON "PartnerOrg"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerRep_clerkUserId_key" ON "PartnerRep"("clerkUserId");

-- CreateIndex
CREATE INDEX "PartnerRep_orgId_idx" ON "PartnerRep"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerRep_orgId_email_key" ON "PartnerRep"("orgId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerOrgMember_clerkUserId_key" ON "PartnerOrgMember"("clerkUserId");

-- CreateIndex
CREATE INDEX "PartnerOrgMember_orgId_idx" ON "PartnerOrgMember"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerOrgMember_orgId_email_key" ON "PartnerOrgMember"("orgId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralLink_code_key" ON "ReferralLink"("code");

-- CreateIndex
CREATE INDEX "ReferralLink_orgId_idx" ON "ReferralLink"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerTransaction_reference_key" ON "PartnerTransaction"("reference");

-- CreateIndex
CREATE INDEX "PartnerTransaction_clientId_idx" ON "PartnerTransaction"("clientId");

-- CreateIndex
CREATE INDEX "PartnerTransaction_orgId_transactionDate_idx" ON "PartnerTransaction"("orgId", "transactionDate");

-- CreateIndex
CREATE INDEX "CommissionEntry_orgId_status_idx" ON "CommissionEntry"("orgId", "status");

-- CreateIndex
CREATE INDEX "CommissionEntry_repId_idx" ON "CommissionEntry"("repId");

-- CreateIndex
CREATE INDEX "CommissionEntry_transactionId_idx" ON "CommissionEntry"("transactionId");

-- CreateIndex
CREATE INDEX "CommissionEntry_payoutId_idx" ON "CommissionEntry"("payoutId");

-- CreateIndex
CREATE INDEX "PartnerPayout_orgId_idx" ON "PartnerPayout"("orgId");

-- CreateIndex
CREATE INDEX "PartnerOrgPricing_orgId_idx" ON "PartnerOrgPricing"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerOrgPricing_orgId_variantId_key" ON "PartnerOrgPricing"("orgId", "variantId");

-- CreateIndex
CREATE INDEX "PartnerAgreement_orgId_idx" ON "PartnerAgreement"("orgId");

-- CreateIndex
CREATE INDEX "PartnerAgreement_repId_idx" ON "PartnerAgreement"("repId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerAgreement_orgId_repId_documentVersion_key" ON "PartnerAgreement"("orgId", "repId", "documentVersion");

-- CreateIndex
CREATE INDEX "PartnerClinicMeta_clientId_idx" ON "PartnerClinicMeta"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerClinicMeta_orgId_clientId_key" ON "PartnerClinicMeta"("orgId", "clientId");

-- CreateIndex
CREATE INDEX "PartnerClinicActivity_clientId_createdAt_idx" ON "PartnerClinicActivity"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "PartnerClinicActivity_orgId_idx" ON "PartnerClinicActivity"("orgId");

-- CreateIndex
CREATE INDEX "PartnerGoal_orgId_idx" ON "PartnerGoal"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerGoal_orgId_repId_metric_period_key" ON "PartnerGoal"("orgId", "repId", "metric", "period");

-- CreateIndex
CREATE INDEX "PartnerQuote_orgId_createdAt_idx" ON "PartnerQuote"("orgId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerApiKey_keyHash_key" ON "PartnerApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "PartnerApiKey_orgId_idx" ON "PartnerApiKey"("orgId");

-- CreateIndex
CREATE INDEX "PartnerWebhook_orgId_idx" ON "PartnerWebhook"("orgId");

-- CreateIndex
CREATE INDEX "Client_partnerOrgId_idx" ON "Client"("partnerOrgId");

-- CreateIndex
CREATE INDEX "Client_partnerRepId_idx" ON "Client"("partnerRepId");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_partnerOrgId_fkey" FOREIGN KEY ("partnerOrgId") REFERENCES "PartnerOrg"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_partnerRepId_fkey" FOREIGN KEY ("partnerRepId") REFERENCES "PartnerRep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_referralLinkId_fkey" FOREIGN KEY ("referralLinkId") REFERENCES "ReferralLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerRep" ADD CONSTRAINT "PartnerRep_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "PartnerOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerOrgMember" ADD CONSTRAINT "PartnerOrgMember_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "PartnerOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralLink" ADD CONSTRAINT "ReferralLink_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "PartnerOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralLink" ADD CONSTRAINT "ReferralLink_repId_fkey" FOREIGN KEY ("repId") REFERENCES "PartnerRep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerTransaction" ADD CONSTRAINT "PartnerTransaction_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerTransaction" ADD CONSTRAINT "PartnerTransaction_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "PartnerOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerTransaction" ADD CONSTRAINT "PartnerTransaction_repId_fkey" FOREIGN KEY ("repId") REFERENCES "PartnerRep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionEntry" ADD CONSTRAINT "CommissionEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "PartnerTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionEntry" ADD CONSTRAINT "CommissionEntry_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "PartnerOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionEntry" ADD CONSTRAINT "CommissionEntry_repId_fkey" FOREIGN KEY ("repId") REFERENCES "PartnerRep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionEntry" ADD CONSTRAINT "CommissionEntry_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "PartnerPayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerPayout" ADD CONSTRAINT "PartnerPayout_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "PartnerOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerPayout" ADD CONSTRAINT "PartnerPayout_repId_fkey" FOREIGN KEY ("repId") REFERENCES "PartnerRep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerOrgPricing" ADD CONSTRAINT "PartnerOrgPricing_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "PartnerOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerOrgPricing" ADD CONSTRAINT "PartnerOrgPricing_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerAgreement" ADD CONSTRAINT "PartnerAgreement_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "PartnerOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerAgreement" ADD CONSTRAINT "PartnerAgreement_repId_fkey" FOREIGN KEY ("repId") REFERENCES "PartnerRep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerClinicMeta" ADD CONSTRAINT "PartnerClinicMeta_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "PartnerOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerClinicMeta" ADD CONSTRAINT "PartnerClinicMeta_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerClinicActivity" ADD CONSTRAINT "PartnerClinicActivity_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "PartnerOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerClinicActivity" ADD CONSTRAINT "PartnerClinicActivity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerClinicActivity" ADD CONSTRAINT "PartnerClinicActivity_repId_fkey" FOREIGN KEY ("repId") REFERENCES "PartnerRep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerGoal" ADD CONSTRAINT "PartnerGoal_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "PartnerOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerGoal" ADD CONSTRAINT "PartnerGoal_repId_fkey" FOREIGN KEY ("repId") REFERENCES "PartnerRep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerQuote" ADD CONSTRAINT "PartnerQuote_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "PartnerOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerQuote" ADD CONSTRAINT "PartnerQuote_repId_fkey" FOREIGN KEY ("repId") REFERENCES "PartnerRep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerApiKey" ADD CONSTRAINT "PartnerApiKey_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "PartnerOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerWebhook" ADD CONSTRAINT "PartnerWebhook_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "PartnerOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;
