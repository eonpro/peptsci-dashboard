/**
 * One-time backfill: mirror every already-captured platform Order into the
 * SalesRecord analytics table. Idempotent — re-running upserts by orderId, so
 * it is safe to run multiple times.
 *
 * Going forward, new captures are synced automatically in
 * reconcileOrderFromPaymentIntent (lib/stripe/payments.ts).
 *
 * Usage:
 *   npm run backfill:sales
 *
 * Requires DB env (PGHOST/PGPASSWORD or DATABASE_URL) in .env.local.
 */

import { prisma } from '../lib/prisma'
import { syncSalesRecordFromOrder } from '../lib/sales'

async function main() {
  if (!prisma) {
    console.error('No database connection configured (PGHOST/PGPASSWORD or DATABASE_URL).')
    process.exit(1)
  }

  const orders = await prisma.order.findMany({
    where: { paymentStatus: 'CAPTURED' },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`Found ${orders.length} captured order(s) to backfill into SalesRecord.`)

  let done = 0
  for (const o of orders) {
    await syncSalesRecordFromOrder(o.id)
    done += 1
    if (done % 25 === 0) console.log(`  ...${done}/${orders.length}`)
  }

  console.log(`Done. Synced ${done} order(s) into SalesRecord.`)
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  try {
    if (prisma) await prisma.$disconnect()
  } catch {
    // ignore
  }
  process.exit(1)
})
