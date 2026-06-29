-- Returns / RMA: ReturnRequest + ReturnItem (with ReturnStatus +
-- ReturnItemCondition enums). Mirrors eonpro/fulfillment-platform's returns,
-- mapped onto PeptSci's Order / OrderItem / ProductVariant domain.
--
-- Authored to run idempotently via the runtime migration runner
-- (POST /api/admin/db/migrate). That runner splits on ';' and skips statements
-- failing with "already exists"/"does not exist"/"duplicate", so:
--   - CREATE TYPE has no IF NOT EXISTS but a re-run's "already exists" is ignored.
--   - CREATE TABLE/INDEX use IF NOT EXISTS.
--   - ALTER TABLE ADD CONSTRAINT re-runs are ignored as "already exists".
-- No dollar-quoted (DO $$) blocks — the splitter does not support them.

CREATE TYPE "ReturnStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'LABEL_SENT', 'IN_TRANSIT', 'RECEIVED', 'INSPECTED', 'RESTOCKED', 'REFUNDED', 'CLOSED');

CREATE TYPE "ReturnItemCondition" AS ENUM ('GOOD', 'DAMAGED', 'MISSING');

-- ReturnRequest -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ReturnRequest" (
  "id" TEXT NOT NULL,
  "rmaNumber" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "clientId" TEXT,
  "status" "ReturnStatus" NOT NULL DEFAULT 'REQUESTED',
  "reason" TEXT,
  "notes" TEXT,
  "refundAmount" DECIMAL(12,2),
  "requestedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "ReturnRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReturnRequest_rmaNumber_key" ON "ReturnRequest"("rmaNumber");
CREATE INDEX IF NOT EXISTS "ReturnRequest_orderId_idx" ON "ReturnRequest"("orderId");
CREATE INDEX IF NOT EXISTS "ReturnRequest_clientId_idx" ON "ReturnRequest"("clientId");
CREATE INDEX IF NOT EXISTS "ReturnRequest_status_idx" ON "ReturnRequest"("status");
CREATE INDEX IF NOT EXISTS "ReturnRequest_createdAt_idx" ON "ReturnRequest"("createdAt");

-- ReturnItem --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ReturnItem" (
  "id" TEXT NOT NULL,
  "returnRequestId" TEXT NOT NULL,
  "orderItemId" TEXT,
  "variantId" TEXT,
  "productName" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "condition" "ReturnItemCondition" NOT NULL DEFAULT 'GOOD',
  "restocked" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReturnItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ReturnItem_returnRequestId_idx" ON "ReturnItem"("returnRequestId");
CREATE INDEX IF NOT EXISTS "ReturnItem_variantId_idx" ON "ReturnItem"("variantId");

-- Foreign keys (canonical Prisma names so the client sees no drift) --------
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
