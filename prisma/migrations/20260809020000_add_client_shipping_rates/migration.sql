-- Per-practice flat shipping rates (dollars). NULL = use global matrix.
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "shippingRateTwoDay" DECIMAL(12,2);
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "shippingRateOvernight" DECIMAL(12,2);
