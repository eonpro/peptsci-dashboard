-- Print COAs with the box: wizard step between packing slip and photo, plus
-- the audit stamp for whether the operator printed from the app or by hand.
-- Plain statements only — the admin migrate runner splits on `;`.

ALTER TYPE "FulfillmentStep" ADD VALUE IF NOT EXISTS 'COAS';

ALTER TABLE "OrderFulfillment" ADD COLUMN IF NOT EXISTS "coasAt" TIMESTAMP(3);
ALTER TABLE "OrderFulfillment" ADD COLUMN IF NOT EXISTS "coasManual" BOOLEAN NOT NULL DEFAULT false;
