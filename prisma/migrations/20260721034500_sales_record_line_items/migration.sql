-- Per-line product breakdown for multi-item orders, so analytics can credit
-- each real product instead of collapsing to "First Product +N more".
ALTER TABLE "SalesRecord" ADD COLUMN "lineItems" JSONB;
