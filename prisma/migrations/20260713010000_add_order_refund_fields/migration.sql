-- Cumulative refund tracking on orders (programmatic refunds).
-- Idempotent: safe to re-run via the runtime migrate runner.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "refundedTotal" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "refundedAt" TIMESTAMP(3);
