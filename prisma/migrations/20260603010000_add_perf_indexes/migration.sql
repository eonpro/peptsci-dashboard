-- Performance indexes for hot filter/sort/join columns.
-- Authored to run idempotently via the runtime migration runner
-- (POST /api/admin/db/migrate) against RDS, which the Prisma CLI cannot reach.
-- `IF NOT EXISTS` keeps re-runs safe; index names match Prisma's canonical
-- "<Table>_<col...>_idx" so `prisma migrate` sees no drift.

-- User: clientId lookups (shop-actor resolution, client user lists)
CREATE INDEX IF NOT EXISTS "User_clientId_idx" ON "User"("clientId");

-- ProductVariant: status filter (active catalog) + productId joins/counts
CREATE INDEX IF NOT EXISTS "ProductVariant_status_idx" ON "ProductVariant"("status");
CREATE INDEX IF NOT EXISTS "ProductVariant_productId_idx" ON "ProductVariant"("productId");

-- Order: order-number lookups, recent-first sorts, charge lookups, and the
-- common client + status + recency listing.
CREATE INDEX IF NOT EXISTS "Order_orderNumber_idx" ON "Order"("orderNumber");
CREATE INDEX IF NOT EXISTS "Order_createdAt_idx" ON "Order"("createdAt");
CREATE INDEX IF NOT EXISTS "Order_stripeChargeId_idx" ON "Order"("stripeChargeId");
CREATE INDEX IF NOT EXISTS "Order_clientId_status_createdAt_idx" ON "Order"("clientId", "status", "createdAt");

-- OrderItem: FK joins from order detail + variant aggregation
CREATE INDEX IF NOT EXISTS "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX IF NOT EXISTS "OrderItem_variantId_idx" ON "OrderItem"("variantId");

-- InventoryAdjustment: per-variant + per-order history
CREATE INDEX IF NOT EXISTS "InventoryAdjustment_variantId_idx" ON "InventoryAdjustment"("variantId");
CREATE INDEX IF NOT EXISTS "InventoryAdjustment_orderId_idx" ON "InventoryAdjustment"("orderId");

-- InventoryBatch: recent-first listing
CREATE INDEX IF NOT EXISTS "InventoryBatch_createdAt_idx" ON "InventoryBatch"("createdAt");

-- AuditLog: by user, by order, and by (entity, entityId)
CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX IF NOT EXISTS "AuditLog_orderId_idx" ON "AuditLog"("orderId");
CREATE INDEX IF NOT EXISTS "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- RetailOrder: storefront + recency listing
CREATE INDEX IF NOT EXISTS "RetailOrder_storefrontId_createdAt_idx" ON "RetailOrder"("storefrontId", "createdAt");
