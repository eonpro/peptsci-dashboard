/**
 * One-time cleanup: force-delete the 6 demo/seed products and everything
 * attached to their variants.
 *
 * Scope (matched by Product.sku): BPC-157, TB-500, SEMA, TIRZ, NAD-NS, GLUT.
 *
 * "Force" means we also remove dependent rows that do NOT cascade at the DB
 * level (OrderItem, InventoryAdjustment, InventoryBatch + events, and any
 * RetailOrderItem tied to a storefront listing of these variants). Rows that
 * DO cascade on variant delete (ClientPricing, StorefrontProduct ->
 * StorefrontRetailPrice) are removed explicitly too so the run is order-safe.
 *
 * This does NOT touch scripts/seed.ts, so re-seeding will recreate them.
 *
 * Run:  npx tsx --env-file=.env.local scripts/remove-demo-products.ts
 */

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { getPoolConfig } from '../lib/db-url'

const DEMO_PRODUCT_SKUS = ['BPC-157', 'TB-500', 'SEMA', 'TIRZ', 'NAD-NS', 'GLUT']

const poolConfig = getPoolConfig()
if (!poolConfig) {
  console.error('No database connection configured (set DATABASE_URL or PGHOST/PGPASSWORD).')
  process.exit(1)
}

const pool = new pg.Pool(poolConfig)
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Looking up demo products by SKU:', DEMO_PRODUCT_SKUS.join(', '), '\n')

  const products = await prisma.product.findMany({
    where: { sku: { in: DEMO_PRODUCT_SKUS } },
    include: { variants: { select: { id: true, sku: true } } },
  })

  if (products.length === 0) {
    console.log('No matching demo products found. Nothing to delete.')
    return
  }

  const productIds = products.map((p) => p.id)
  const variantIds = products.flatMap((p) => p.variants.map((v) => v.id))

  console.log(`Found ${products.length} product(s), ${variantIds.length} variant(s):`)
  for (const p of products) {
    console.log(`  - ${p.name} (${p.sku}) -> ${p.variants.map((v) => v.sku).join(', ')}`)
  }
  console.log('')

  const result = await prisma.$transaction(async (tx) => {
    // Storefront listings for these variants (and the retail order items that
    // reference those listings) must go before we can drop StorefrontProduct.
    const storefrontProducts = await tx.storefrontProduct.findMany({
      where: { variantId: { in: variantIds } },
      select: { id: true },
    })
    const storefrontProductIds = storefrontProducts.map((sp) => sp.id)

    const retailOrderItems = storefrontProductIds.length
      ? await tx.retailOrderItem.deleteMany({
          where: { storefrontProductId: { in: storefrontProductIds } },
        })
      : { count: 0 }

    // Dependents of ProductVariant that do not cascade.
    const orderItems = await tx.orderItem.deleteMany({
      where: { variantId: { in: variantIds } },
    })
    const inventoryAdjustments = await tx.inventoryAdjustment.deleteMany({
      where: { variantId: { in: variantIds } },
    })
    // InventoryBatchEvent cascades when its batch is deleted.
    const inventoryBatches = await tx.inventoryBatch.deleteMany({
      where: { variantId: { in: variantIds } },
    })

    // These cascade on variant delete, but remove explicitly for clarity/safety.
    const storefrontProductsDeleted = await tx.storefrontProduct.deleteMany({
      where: { variantId: { in: variantIds } },
    })
    const clientPricing = await tx.clientPricing.deleteMany({
      where: { variantId: { in: variantIds } },
    })

    const variants = await tx.productVariant.deleteMany({
      where: { id: { in: variantIds } },
    })
    const media = await tx.productMedia.deleteMany({
      where: { productId: { in: productIds } },
    })
    const productsDeleted = await tx.product.deleteMany({
      where: { id: { in: productIds } },
    })

    return {
      retailOrderItems: retailOrderItems.count,
      orderItems: orderItems.count,
      inventoryAdjustments: inventoryAdjustments.count,
      inventoryBatches: inventoryBatches.count,
      storefrontProducts: storefrontProductsDeleted.count,
      clientPricing: clientPricing.count,
      variants: variants.count,
      media: media.count,
      products: productsDeleted.count,
    }
  })

  console.log('Deleted:')
  console.log(`  RetailOrderItems:      ${result.retailOrderItems}`)
  console.log(`  OrderItems:            ${result.orderItems}`)
  console.log(`  InventoryAdjustments:  ${result.inventoryAdjustments}`)
  console.log(`  InventoryBatches:      ${result.inventoryBatches}`)
  console.log(`  StorefrontProducts:    ${result.storefrontProducts}`)
  console.log(`  ClientPricing:         ${result.clientPricing}`)
  console.log(`  ProductMedia:          ${result.media}`)
  console.log(`  ProductVariants:       ${result.variants}`)
  console.log(`  Products:              ${result.products}`)
  console.log('\nCleanup complete.')
}

main()
  .catch((e) => {
    console.error('Cleanup failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
