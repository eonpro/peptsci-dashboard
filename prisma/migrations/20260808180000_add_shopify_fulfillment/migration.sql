-- AlterEnum
ALTER TYPE "OrderSource" ADD VALUE IF NOT EXISTS 'SHOPIFY';

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ShopifyConnectionStatus" AS ENUM ('ACTIVE', 'DISABLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ShopifyConnection" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "webhookSecret" TEXT NOT NULL,
    "apiVersion" TEXT NOT NULL DEFAULT '2025-07',
    "status" "ShopifyConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastWebhookAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopifyConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ShopifyVariantMapping" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "shopifyVariantId" TEXT NOT NULL,
    "shopifySku" TEXT,
    "shopifyTitle" TEXT,
    "variantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopifyVariantMapping_pkey" PRIMARY KEY ("id")
);

-- AlterTable Order
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shopifyConnectionId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shopifyOrderId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shopifyOrderName" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shopifyFulfillmentOrderId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shopifyFulfillmentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ShopifyConnection_clientId_key" ON "ShopifyConnection"("clientId");
CREATE INDEX IF NOT EXISTS "ShopifyConnection_shopDomain_idx" ON "ShopifyConnection"("shopDomain");
CREATE INDEX IF NOT EXISTS "ShopifyConnection_status_idx" ON "ShopifyConnection"("status");

CREATE UNIQUE INDEX IF NOT EXISTS "ShopifyVariantMapping_connectionId_shopifyVariantId_key" ON "ShopifyVariantMapping"("connectionId", "shopifyVariantId");
CREATE INDEX IF NOT EXISTS "ShopifyVariantMapping_variantId_idx" ON "ShopifyVariantMapping"("variantId");
CREATE INDEX IF NOT EXISTS "ShopifyVariantMapping_shopifySku_idx" ON "ShopifyVariantMapping"("shopifySku");

CREATE UNIQUE INDEX IF NOT EXISTS "Order_clientId_shopifyOrderId_key" ON "Order"("clientId", "shopifyOrderId");
CREATE INDEX IF NOT EXISTS "Order_shopifyConnectionId_idx" ON "Order"("shopifyConnectionId");
CREATE INDEX IF NOT EXISTS "Order_shopifyOrderId_idx" ON "Order"("shopifyOrderId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ShopifyConnection" ADD CONSTRAINT "ShopifyConnection_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ShopifyVariantMapping" ADD CONSTRAINT "ShopifyVariantMapping_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ShopifyConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ShopifyVariantMapping" ADD CONSTRAINT "ShopifyVariantMapping_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "Order" ADD CONSTRAINT "Order_shopifyConnectionId_fkey" FOREIGN KEY ("shopifyConnectionId") REFERENCES "ShopifyConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
