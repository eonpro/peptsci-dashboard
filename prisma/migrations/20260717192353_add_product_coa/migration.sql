-- CreateTable
CREATE TABLE "ProductCoa" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "fileUrl" TEXT,
    "fileBase64" TEXT,
    "contentType" TEXT,
    "fileName" TEXT,
    "compoundName" TEXT NOT NULL,
    "doseLabel" TEXT,
    "casNumber" TEXT,
    "appearance" TEXT,
    "batchNumber" TEXT,
    "taskNumber" TEXT,
    "reportCode" TEXT,
    "issuingLab" TEXT,
    "signedBy" TEXT,
    "manufacturer" TEXT,
    "testingLab" TEXT,
    "clientOfRecord" TEXT,
    "distributor" TEXT,
    "orderedOn" TIMESTAMP(3),
    "receivedOn" TIMESTAMP(3),
    "analyzedOn" TIMESTAMP(3),
    "purityPercent" DOUBLE PRECISION,
    "puritySpecMin" DOUBLE PRECISION DEFAULT 98,
    "purityRejectMax" DOUBLE PRECISION DEFAULT 2,
    "assayMeasuredMg" DOUBLE PRECISION,
    "assayLabelClaimMg" DOUBLE PRECISION,
    "identitySpec" TEXT,
    "identityResult" TEXT,
    "notes" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCoa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductCoa_variantId_idx" ON "ProductCoa"("variantId");

-- CreateIndex
CREATE INDEX "ProductCoa_published_idx" ON "ProductCoa"("published");

-- AddForeignKey
ALTER TABLE "ProductCoa" ADD CONSTRAINT "ProductCoa_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
