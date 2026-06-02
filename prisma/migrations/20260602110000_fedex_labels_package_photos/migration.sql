-- CreateEnum
CREATE TYPE "ShipmentLabelStatus" AS ENUM ('CREATED', 'VOIDED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "carrier" TEXT,
ADD COLUMN     "trackingNumber" TEXT,
ADD COLUMN     "trackingUrl" TEXT,
ADD COLUMN     "shippingStatus" TEXT,
ADD COLUMN     "shippedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ShipmentLabel" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "clientId" TEXT,
    "createdById" TEXT,
    "carrier" TEXT NOT NULL DEFAULT 'FEDEX',
    "trackingNumber" TEXT NOT NULL,
    "shipmentId" TEXT,
    "serviceType" TEXT NOT NULL,
    "originAddress" JSONB NOT NULL,
    "destinationAddress" JSONB NOT NULL,
    "weightLbs" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "length" DOUBLE PRECISION,
    "width" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "labelFormat" TEXT NOT NULL DEFAULT 'PDF',
    "labelBlobUrl" TEXT,
    "labelPdfBase64" TEXT,
    "status" "ShipmentLabelStatus" NOT NULL DEFAULT 'CREATED',
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackagePhoto" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "clientId" TEXT,
    "orderRef" TEXT NOT NULL,
    "trackingNumber" TEXT,
    "trackingSource" TEXT,
    "capturedById" TEXT,
    "blobUrl" TEXT,
    "imageBase64" TEXT,
    "contentType" TEXT NOT NULL DEFAULT 'image/jpeg',
    "fileSize" INTEGER,
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "matchedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackagePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShipmentLabel_orderId_idx" ON "ShipmentLabel"("orderId");

-- CreateIndex
CREATE INDEX "ShipmentLabel_clientId_idx" ON "ShipmentLabel"("clientId");

-- CreateIndex
CREATE INDEX "ShipmentLabel_trackingNumber_idx" ON "ShipmentLabel"("trackingNumber");

-- CreateIndex
CREATE INDEX "PackagePhoto_orderId_idx" ON "PackagePhoto"("orderId");

-- CreateIndex
CREATE INDEX "PackagePhoto_clientId_idx" ON "PackagePhoto"("clientId");

-- CreateIndex
CREATE INDEX "PackagePhoto_orderRef_idx" ON "PackagePhoto"("orderRef");

-- CreateIndex
CREATE INDEX "PackagePhoto_createdAt_idx" ON "PackagePhoto"("createdAt");

-- CreateIndex
CREATE INDEX "Order_trackingNumber_idx" ON "Order"("trackingNumber");

-- AddForeignKey
ALTER TABLE "ShipmentLabel" ADD CONSTRAINT "ShipmentLabel_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLabel" ADD CONSTRAINT "ShipmentLabel_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLabel" ADD CONSTRAINT "ShipmentLabel_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagePhoto" ADD CONSTRAINT "PackagePhoto_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagePhoto" ADD CONSTRAINT "PackagePhoto_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagePhoto" ADD CONSTRAINT "PackagePhoto_capturedById_fkey" FOREIGN KEY ("capturedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
