-- CreateEnum
CREATE TYPE "ShipTo" AS ENUM ('PRACTICE', 'PATIENT');

-- CreateEnum
CREATE TYPE "ShipSpeed" AS ENUM ('TWO_DAY', 'OVERNIGHT');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "npiData" JSONB,
ADD COLUMN     "npiNumber" TEXT,
ADD COLUMN     "providerName" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "patientId" TEXT,
ADD COLUMN     "shipSpeed" "ShipSpeed" NOT NULL DEFAULT 'TWO_DAY',
ADD COLUMN     "shipTo" "ShipTo" NOT NULL DEFAULT 'PRACTICE';

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "address" JSONB NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Patient_clientId_idx" ON "Patient"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_npiNumber_key" ON "Client"("npiNumber");

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
