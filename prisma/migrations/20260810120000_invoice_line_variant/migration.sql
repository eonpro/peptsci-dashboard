-- Catalog linkage for admin product-picker invoice lines so PAID product-only
-- invoices can mint a fulfillable Order (internal #orderNumber) + reserve stock.
-- Plain statements only — the admin migrate runner splits on `;` and cannot
-- execute dollar-quoted DO $$ ... $$ blocks.

ALTER TABLE "InvoiceLineItem" ADD COLUMN IF NOT EXISTS "variantId" TEXT;

CREATE INDEX IF NOT EXISTS "InvoiceLineItem_variantId_idx" ON "InvoiceLineItem"("variantId");

ALTER TABLE "InvoiceLineItem"
  ADD CONSTRAINT "InvoiceLineItem_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
