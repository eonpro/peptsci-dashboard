-- CreateEnum
CREATE TYPE "PatientMessageSenderRole" AS ENUM ('CLINIC', 'PEPTSCI');

-- CreateTable
CREATE TABLE "PatientMessage" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "senderId" TEXT,
    "senderName" TEXT NOT NULL,
    "senderRole" "PatientMessageSenderRole" NOT NULL,
    "body" TEXT NOT NULL,
    "readByClinic" BOOLEAN NOT NULL DEFAULT false,
    "readByAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientMessage_patientId_createdAt_idx" ON "PatientMessage"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "PatientMessage_clientId_senderRole_readByClinic_idx" ON "PatientMessage"("clientId", "senderRole", "readByClinic");

-- CreateIndex
CREATE INDEX "PatientMessage_patientId_senderRole_readByAdmin_idx" ON "PatientMessage"("patientId", "senderRole", "readByAdmin");

-- AddForeignKey
ALTER TABLE "PatientMessage" ADD CONSTRAINT "PatientMessage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientMessage" ADD CONSTRAINT "PatientMessage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientMessage" ADD CONSTRAINT "PatientMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
