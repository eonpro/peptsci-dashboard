-- New Postgres-only analytics + purchasing tables that replace the Google
-- Sheets / Airtable data layer: SalesRecord (sales analytics), CompetitorPrice
-- (competitor comparison), and DistributorOrder/Line (purchasing + expenses).
--
-- Authored to run idempotently via the runtime migration runner
-- (POST /api/admin/db/migrate) against RDS, which the Prisma CLI cannot reach.
-- `IF NOT EXISTS` keeps re-runs safe; names match Prisma's canonical
-- "<Table>_<col...>_idx" / "_key" so `prisma` sees no drift.

-- SalesRecord -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "SalesRecord" (
  "id" TEXT NOT NULL,
  "date" TIMESTAMP(3),
  "orderRef" TEXT NOT NULL DEFAULT '',
  "customerName" TEXT NOT NULL DEFAULT '',
  "customerEmail" TEXT NOT NULL DEFAULT '',
  "customerPhone" TEXT NOT NULL DEFAULT '',
  "address" TEXT NOT NULL DEFAULT '',
  "city" TEXT NOT NULL DEFAULT '',
  "state" TEXT NOT NULL DEFAULT '',
  "zip" TEXT NOT NULL DEFAULT '',
  "trackingNumber" TEXT NOT NULL DEFAULT '',
  "invoicePaid" BOOLEAN NOT NULL DEFAULT false,
  "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "vials" INTEGER NOT NULL DEFAULT 0,
  "amountPerVial" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "product" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT '',
  "unitCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "cogs" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "orderId" TEXT,
  "stripePaymentIntentId" TEXT,
  "externalId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SalesRecord_orderId_key" ON "SalesRecord"("orderId");
CREATE UNIQUE INDEX IF NOT EXISTS "SalesRecord_stripePaymentIntentId_key" ON "SalesRecord"("stripePaymentIntentId");
CREATE UNIQUE INDEX IF NOT EXISTS "SalesRecord_externalId_key" ON "SalesRecord"("externalId");
CREATE INDEX IF NOT EXISTS "SalesRecord_date_idx" ON "SalesRecord"("date");
CREATE INDEX IF NOT EXISTS "SalesRecord_customerEmail_idx" ON "SalesRecord"("customerEmail");

-- CompetitorPrice ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS "CompetitorPrice" (
  "id" TEXT NOT NULL,
  "competitorName" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "dose" TEXT NOT NULL DEFAULT '',
  "theirPrice" DECIMAL(12,2) NOT NULL,
  "ourSrp" DECIMAL(12,2) NOT NULL,
  "diff" DECIMAL(12,2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompetitorPrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CompetitorPrice_competitorName_productName_dose_key" ON "CompetitorPrice"("competitorName", "productName", "dose");
CREATE INDEX IF NOT EXISTS "CompetitorPrice_productName_idx" ON "CompetitorPrice"("productName");

-- DistributorOrder + DistributorOrderLine ---------------------------------
CREATE TABLE IF NOT EXISTS "DistributorOrder" (
  "id" TEXT NOT NULL,
  "externalId" TEXT,
  "orderDate" TIMESTAMP(3),
  "vendor" TEXT NOT NULL DEFAULT 'Distributor',
  "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "shipping" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "paypalFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'delivered',
  "trackingNumber" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DistributorOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DistributorOrder_externalId_key" ON "DistributorOrder"("externalId");
CREATE INDEX IF NOT EXISTS "DistributorOrder_orderDate_idx" ON "DistributorOrder"("orderDate");

CREATE TABLE IF NOT EXISTS "DistributorOrderLine" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "dose" TEXT NOT NULL DEFAULT '',
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "unitCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "lineTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DistributorOrderLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DistributorOrderLine_orderId_idx" ON "DistributorOrderLine"("orderId");

ALTER TABLE "DistributorOrderLine" ADD CONSTRAINT "DistributorOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DistributorOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
