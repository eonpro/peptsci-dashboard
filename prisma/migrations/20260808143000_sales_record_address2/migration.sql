-- Suite / apt line from Stripe address.line2 (shipping preferred over billing).
ALTER TABLE "SalesRecord" ADD COLUMN "address2" TEXT NOT NULL DEFAULT '';
