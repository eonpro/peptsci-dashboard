/**
 * Pre-flight check before enabling CHECKOUT_ENFORCE_STOCK.
 *
 * When the gate is on, checkout rejects carts whose quantities exceed
 * sellable stock (onHand − reserved). If inventory counts were never
 * populated, flipping the gate blocks EVERY checkout (observed in prod
 * Jul 13). This script reports, read-only:
 *   - how many ACTIVE variants have sellable stock vs zero/negative
 *   - which zero-stock variants actually sold recently (the ones that
 *     would start bouncing orders)
 *
 * Usage:
 *   npx tsx --env-file=env.local scripts/check-stock-enforcement-readiness.ts
 *   (point the env file at whichever database you're about to enforce on)
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { getPoolConfig } from '../lib/db-url'

const poolConfig = getPoolConfig()
if (!poolConfig) {
  console.error('No database connection configured (set DATABASE_URL or PG* vars).')
  process.exit(1)
}

const pool = new pg.Pool(poolConfig)
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  const variants = await prisma.productVariant.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      sku: true,
      dose: true,
      inventoryOnHand: true,
      inventoryReserved: true,
      product: { select: { name: true, status: true } },
    },
  })

  const since = new Date(Date.now() - 30 * 86_400_000)
  const recentSales = await prisma.orderItem.groupBy({
    by: ['variantId'],
    where: { order: { createdAt: { gte: since }, status: { notIn: ['DRAFT', 'CANCELLED'] } } },
    _sum: { quantity: true },
  })
  const soldByVariant = new Map(recentSales.map((r) => [r.variantId, r._sum.quantity ?? 0]))

  const sellable = variants.filter((v) => v.product.status === 'ACTIVE')
  const withStock = sellable.filter((v) => v.inventoryOnHand - v.inventoryReserved > 0)
  const zeroStock = sellable.filter((v) => v.inventoryOnHand - v.inventoryReserved <= 0)
  const zeroButSelling = zeroStock
    .map((v) => ({ ...v, sold30d: soldByVariant.get(v.id) ?? 0 }))
    .filter((v) => v.sold30d > 0)
    .sort((a, b) => b.sold30d - a.sold30d)

  const totalOnHand = sellable.reduce((s, v) => s + v.inventoryOnHand, 0)

  console.log('── Stock enforcement readiness ─────────────────────────────')
  console.log(`ACTIVE variants (sellable):        ${sellable.length}`)
  console.log(`  with sellable stock (avail > 0): ${withStock.length}`)
  console.log(`  zero / negative availability:    ${zeroStock.length}`)
  console.log(`Total units on hand:               ${totalOnHand}`)
  console.log('')

  if (totalOnHand === 0) {
    console.log('✖ NOT READY: no inventory counts recorded at all.')
    console.log('  Enabling CHECKOUT_ENFORCE_STOCK now would block every checkout.')
    process.exitCode = 2
  } else if (zeroButSelling.length > 0) {
    console.log(`⚠ ${zeroButSelling.length} variant(s) sold in the last 30 days but show no sellable stock.`)
    console.log('  These would start rejecting checkouts once the gate is on:')
    for (const v of zeroButSelling.slice(0, 25)) {
      const avail = v.inventoryOnHand - v.inventoryReserved
      console.log(
        `    ${v.product.name}${v.dose ? ` ${v.dose}` : ''} [${v.sku ?? v.id}] — ` +
          `avail ${avail} (onHand ${v.inventoryOnHand} − reserved ${v.inventoryReserved}), sold ${v.sold30d} in 30d`
      )
    }
    console.log('  Receive/true-up these counts first, or accept that they will show Out of Stock.')
    process.exitCode = 1
  } else {
    console.log('✔ READY: counts are populated and every recently-selling variant has sellable stock.')
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
