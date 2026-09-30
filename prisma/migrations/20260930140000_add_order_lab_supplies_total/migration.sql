-- Flat "Lab supplies" charge on clinic shop checkout orders (lib/checkout-core.ts).
-- Ships ahead of the code that reads it: apply in prod before the checkout change deploys.
-- Idempotent: safe to re-run via the runtime migrate runner.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "labSuppliesTotal" DECIMAL(12,2) NOT NULL DEFAULT 0;
