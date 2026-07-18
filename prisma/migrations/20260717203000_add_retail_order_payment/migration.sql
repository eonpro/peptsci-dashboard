-- Retail storefront card payments: RetailOrder gains a payment lifecycle.
-- Idempotent (IF NOT EXISTS) — consistent with the runtime migrate runner.
ALTER TABLE "RetailOrder" ADD COLUMN IF NOT EXISTS "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "RetailOrder" ADD COLUMN IF NOT EXISTS "stripePaymentIntentId" TEXT;
ALTER TABLE "RetailOrder" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "RetailOrder_stripePaymentIntentId_key" ON "RetailOrder"("stripePaymentIntentId");
