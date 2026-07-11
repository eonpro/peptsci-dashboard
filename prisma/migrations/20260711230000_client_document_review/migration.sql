-- Client compliance documents: upload storage, review workflow, expiry tracking.
CREATE TYPE "ClientDocumentStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');
ALTER TYPE "ClientDocumentType" ADD VALUE IF NOT EXISTS 'RESALE_CERT';
ALTER TABLE "ClientDocument" ALTER COLUMN "fileUrl" DROP NOT NULL;
ALTER TABLE "ClientDocument" ADD COLUMN "label" TEXT;
ALTER TABLE "ClientDocument" ADD COLUMN "fileBase64" TEXT;
ALTER TABLE "ClientDocument" ADD COLUMN "contentType" TEXT;
ALTER TABLE "ClientDocument" ADD COLUMN "fileName" TEXT;
ALTER TABLE "ClientDocument" ADD COLUMN "fileSize" INTEGER;
ALTER TABLE "ClientDocument" ADD COLUMN "status" "ClientDocumentStatus" NOT NULL DEFAULT 'PENDING_REVIEW';
ALTER TABLE "ClientDocument" ADD COLUMN "reviewNotes" TEXT;
ALTER TABLE "ClientDocument" ADD COLUMN "reviewedBy" TEXT;
ALTER TABLE "ClientDocument" ADD COLUMN "reviewedAt" TIMESTAMP(3);
ALTER TABLE "ClientDocument" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "ClientDocument" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "ClientDocument_clientId_idx" ON "ClientDocument"("clientId");
CREATE INDEX "ClientDocument_status_idx" ON "ClientDocument"("status");
