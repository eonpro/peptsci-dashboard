-- Shopify inbound hold queue: map products → invoice → charge → fulfillment order.
CREATE TYPE "ShopifyInboundStatus" AS ENUM (
  'NEEDS_MAPPING',
  'READY',
  'INVOICED',
  'FULFILLMENT_QUEUED',
  'CANCELLED'
);

CREATE TABLE "ShopifyInboundOrder" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "shopifyOrderId" TEXT NOT NULL,
  "shopifyOrderName" TEXT,
  "status" "ShopifyInboundStatus" NOT NULL DEFAULT 'NEEDS_MAPPING',
  "shipSpeed" "ShipSpeed" NOT NULL DEFAULT 'TWO_DAY',
  "shippingAddress" JSONB,
  "buyerEmail" TEXT,
  "buyerNote" TEXT,
  "shopifyFoId" TEXT,
  "invoiceId" TEXT,
  "orderId" TEXT,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ShopifyInboundOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShopifyInboundLine" (
  "id" TEXT NOT NULL,
  "inboundOrderId" TEXT NOT NULL,
  "shopifyVariantId" TEXT,
  "shopifySku" TEXT,
  "shopifyTitle" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "variantId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ShopifyInboundLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopifyInboundOrder_invoiceId_key" ON "ShopifyInboundOrder"("invoiceId");
CREATE UNIQUE INDEX "ShopifyInboundOrder_orderId_key" ON "ShopifyInboundOrder"("orderId");
CREATE UNIQUE INDEX "ShopifyInboundOrder_clientId_shopifyOrderId_key" ON "ShopifyInboundOrder"("clientId", "shopifyOrderId");
CREATE INDEX "ShopifyInboundOrder_connectionId_status_idx" ON "ShopifyInboundOrder"("connectionId", "status");
CREATE INDEX "ShopifyInboundOrder_status_idx" ON "ShopifyInboundOrder"("status");
CREATE INDEX "ShopifyInboundLine_inboundOrderId_idx" ON "ShopifyInboundLine"("inboundOrderId");
CREATE INDEX "ShopifyInboundLine_variantId_idx" ON "ShopifyInboundLine"("variantId");

ALTER TABLE "ShopifyInboundOrder" ADD CONSTRAINT "ShopifyInboundOrder_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ShopifyConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopifyInboundOrder" ADD CONSTRAINT "ShopifyInboundOrder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopifyInboundOrder" ADD CONSTRAINT "ShopifyInboundOrder_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShopifyInboundOrder" ADD CONSTRAINT "ShopifyInboundOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShopifyInboundLine" ADD CONSTRAINT "ShopifyInboundLine_inboundOrderId_fkey" FOREIGN KEY ("inboundOrderId") REFERENCES "ShopifyInboundOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopifyInboundLine" ADD CONSTRAINT "ShopifyInboundLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
