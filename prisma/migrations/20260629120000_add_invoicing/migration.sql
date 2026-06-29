-- Billing & invoicing (B2B accounts receivable): Invoice + InvoiceLineItem +
-- InvoiceAdjustment + InvoicePayment, with InvoiceStatus + AdjustmentKind enums.
--
-- Idempotent for the runtime migration runner (POST /api/admin/db/migrate):
-- splits on ';', skips "already exists"/"does not exist"/"duplicate". No
-- dollar-quoted (DO $$) blocks. invoiceNumber uses a dedicated SEQUENCE so the
-- runner doesn't depend on Prisma's autoincrement plumbing.

CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PARTIAL', 'PAID', 'OVERDUE', 'VOID');
CREATE TYPE "AdjustmentKind" AS ENUM ('FIXED', 'PERCENT');

CREATE SEQUENCE IF NOT EXISTS "Invoice_invoiceNumber_seq";

CREATE TABLE IF NOT EXISTS "Invoice" (
  "id" TEXT NOT NULL,
  "invoiceNumber" INTEGER NOT NULL DEFAULT nextval('"Invoice_invoiceNumber_seq"'),
  "clientId" TEXT NOT NULL,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
  "periodStart" TIMESTAMP(3),
  "periodEnd" TIMESTAMP(3),
  "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paymentTermsDays" INTEGER NOT NULL DEFAULT 30,
  "dueDate" TIMESTAMP(3),
  "balanceForward" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "notes" TEXT,
  "createdById" TEXT,
  "voidedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");
CREATE INDEX IF NOT EXISTS "Invoice_clientId_idx" ON "Invoice"("clientId");
CREATE INDEX IF NOT EXISTS "Invoice_status_idx" ON "Invoice"("status");
CREATE INDEX IF NOT EXISTS "Invoice_dueDate_idx" ON "Invoice"("dueDate");
CREATE INDEX IF NOT EXISTS "Invoice_clientId_status_idx" ON "Invoice"("clientId", "status");

CREATE TABLE IF NOT EXISTS "InvoiceLineItem" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "orderId" TEXT,
  "description" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvoiceLineItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InvoiceLineItem_invoiceId_idx" ON "InvoiceLineItem"("invoiceId");
CREATE INDEX IF NOT EXISTS "InvoiceLineItem_orderId_idx" ON "InvoiceLineItem"("orderId");

CREATE TABLE IF NOT EXISTS "InvoiceAdjustment" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "kind" "AdjustmentKind" NOT NULL,
  "amount" DECIMAL(12,2),
  "percent" DECIMAL(6,3),
  "reason" TEXT NOT NULL DEFAULT '',
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvoiceAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InvoiceAdjustment_invoiceId_idx" ON "InvoiceAdjustment"("invoiceId");

CREATE TABLE IF NOT EXISTS "InvoicePayment" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "method" TEXT,
  "reference" TEXT,
  "stripePaymentIntentId" TEXT,
  "notes" TEXT,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvoicePayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "InvoicePayment_stripePaymentIntentId_key" ON "InvoicePayment"("stripePaymentIntentId");
CREATE INDEX IF NOT EXISTS "InvoicePayment_invoiceId_idx" ON "InvoicePayment"("invoiceId");

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InvoiceAdjustment" ADD CONSTRAINT "InvoiceAdjustment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
