-- Per-practice flat shipping rates (dollars). NULL = use global matrix.
ALTER TABLE "Client" ADD COLUMN "shippingRateTwoDay" DECIMAL(12,2);
ALTER TABLE "Client" ADD COLUMN "shippingRateOvernight" DECIMAL(12,2);
