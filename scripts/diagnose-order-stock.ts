/**
 * Read-only diagnostic: why does FedEx label creation return
 * INSUFFICIENT_BATCH_STOCK (409) for a given order?
 *
 * Reproduces the exact allocation check used by consumeOrderInventoryTx:
 * for each order line (aggregated by variant) it lists the allocatable
 * batches (RECEIVED, qtyOnHand > 0, bud >= today UTC) and reports the
 * shortfall per variant, plus batches excluded and why.
 *
 * Usage:
 *   npx tsx --env-file=<env file> scripts/diagnose-order-stock.ts <orderNumber>
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { getPoolConfig } from '../lib/db-url'

const orderNumber = Number(process.argv[2])
if (!Number.isFinite(orderNumber)) {
  console.error('Usage: npx tsx scripts/diagnose-order-stock.ts <orderNumber>')
  process.exit(1)
}

const poolConfig = getPoolConfig()
if (!poolConfig) {
  console.error('No database connection configured (set DATABASE_URL or PG* vars).')
  process.exit(1)
}
const pool = new pg.Pool(poolConfig as pg.PoolConfig)
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

function minAllocatableBud(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

async function main() {
  const order = await prisma.order.findFirst({
    where: { orderNumber },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      items: {
        select: {
          variantId: true,
          quantity: true,
          variant: { select: { sku: true, dose: true, inventoryOnHand: true, inventoryReserved: true, product: { select: { name: true } } } },
        },
      },
      reservations: { select: { variantId: true, quantity: true, status: true } },
    },
  })
  if (!order) {
    console.error(`Order #${orderNumber} not found`)
    process.exit(1)
  }

  console.log(`Order #${order.orderNumber} (${order.id}) — status ${order.status}, payment ${order.paymentStatus}`)
  console.log(`Reservations: ${JSON.stringify(order.reservations)}`)
  console.log('')

  const minBud = minAllocatableBud()
  console.log(`Allocatable-batch cutoff (BUD >= UTC today): ${minBud.toISOString()}`)
  console.log('')

  // Aggregate by variant like the consume path does.
  const totals = new Map<string, number>()
  for (const it of order.items) totals.set(it.variantId, (totals.get(it.variantId) ?? 0) + it.quantity)

  let anyShortfall = false
  for (const it of order.items) {
    const need = totals.get(it.variantId) ?? it.quantity
    const v = it.variant
    console.log(
      `Line: ${v.product.name} ${v.dose ?? ''} [${v.sku ?? it.variantId}] — need ${need} ` +
        `(variant counters: onHand ${v.inventoryOnHand}, reserved ${v.inventoryReserved})`
    )

    const allBatches = await prisma.inventoryBatch.findMany({
      where: { variantId: it.variantId },
      orderBy: [{ bud: 'asc' }, { batchNumber: 'asc' }],
      select: { batchNumber: true, status: true, qtyOnHand: true, bud: true },
    })
    if (allBatches.length === 0) {
      console.log('  ✖ NO batches exist for this variant at all — nothing to draw from.')
      anyShortfall = true
      console.log('')
      continue
    }

    let allocatable = 0
    for (const b of allBatches) {
      const eligible = b.status === 'RECEIVED' && b.qtyOnHand > 0 && b.bud >= minBud
      const reasons: string[] = []
      if (b.status !== 'RECEIVED') reasons.push(`status=${b.status}`)
      if (b.qtyOnHand <= 0) reasons.push(`qtyOnHand=${b.qtyOnHand}`)
      if (b.bud < minBud) reasons.push(`BUD expired (${b.bud.toISOString().slice(0, 10)})`)
      if (eligible) allocatable += b.qtyOnHand
      console.log(
        `  batch ${b.batchNumber}: onHand ${b.qtyOnHand}, bud ${b.bud.toISOString().slice(0, 10)}, status ${b.status} ` +
          (eligible ? '→ allocatable' : `→ EXCLUDED (${reasons.join(', ')})`)
      )
    }
    const shortfall = Math.max(0, need - allocatable)
    if (shortfall > 0) anyShortfall = true
    console.log(`  allocatable total: ${allocatable} → ${shortfall > 0 ? `SHORTFALL ${shortfall}` : 'OK'}`)
    console.log('')
  }

  console.log(anyShortfall ? '✖ This order WOULD hit INSUFFICIENT_BATCH_STOCK (409).' : '✔ Batch stock is sufficient; the 409 must come from elsewhere.')
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
