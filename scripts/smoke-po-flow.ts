/**
 * Smoke test for the PO → incoming inventory → batch receive flow.
 *
 * Run: npx tsx --env-file=.env.local scripts/smoke-po-flow.ts
 *
 * Creates a throwaway variant + pending DistributorOrder (as the PO generator
 * would), asserts the Inventory rollup reports the units as incoming, receives
 * a batch, and asserts the receipt burns down the PO line and closes the
 * order. Cleans up after itself.
 */

import { prisma } from '../lib/prisma'
import { listCatalogStock } from '../lib/inventory'
import { createBatch } from '../lib/inventory-batches'

function assert(cond: boolean, label: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${label}`)
  console.log(`ok - ${label}`)
}

async function main() {
  if (!prisma) throw new Error('Database not configured')
  const suffix = Date.now().toString(36).toUpperCase()
  const poNumber = `PO-SMOKE-${suffix}`

  const product = await prisma.product.create({
    data: { name: `Smoke Peptide ${suffix}`, sku: `SMOKE-${suffix}`, status: 'ACTIVE' },
  })
  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      sku: `SMOKE-${suffix}-10`,
      dose: '10mg',
      unitCost: 12.5,
      srp: 60,
      status: 'ACTIVE',
    },
  })

  try {
    // 1. Record a placed PO (what POST /api/admin/purchase-orders does)
    const po = await prisma.distributorOrder.create({
      data: {
        externalId: poNumber,
        orderDate: new Date(),
        vendor: 'Smoke Vendor',
        subtotal: 125,
        total: 125,
        status: 'pending',
        lines: {
          create: [
            {
              productName: product.name,
              dose: '10mg',
              sku: variant.sku,
              quantity: 10,
              unitCost: 12.5,
              lineTotal: 125,
            },
          ],
        },
      },
    })

    // 2. Incoming shows on the inventory rollup, not as available
    let rows = await listCatalogStock()
    let row = rows.find((r) => r.variantId === variant.id)
    assert(!!row, 'variant appears in catalog stock')
    assert(row!.incoming === 10, `incoming = 10 (got ${row!.incoming})`)
    assert(row!.onHand === 0, 'onHand still 0 before receiving')

    // 3. Receive a partial batch → incoming burns down
    await createBatch(
      {
        variantId: variant.id,
        bud: '2027-12-31',
        qtyReceived: 6,
      },
      { clerkUserId: null, label: 'smoke-test' }
    )
    rows = await listCatalogStock()
    row = rows.find((r) => r.variantId === variant.id)
    assert(row!.onHand === 6, `onHand = 6 after receipt (got ${row!.onHand})`)
    assert(row!.incoming === 4, `incoming = 4 after partial receipt (got ${row!.incoming})`)
    let order = await prisma.distributorOrder.findUnique({ where: { id: po.id } })
    assert(order!.status === 'pending', 'PO still pending after partial receipt')

    // 4. Receive the rest → PO closes, incoming clears
    await createBatch(
      {
        variantId: variant.id,
        bud: '2027-12-31',
        qtyReceived: 4,
      },
      { clerkUserId: null, label: 'smoke-test' }
    )
    rows = await listCatalogStock()
    row = rows.find((r) => r.variantId === variant.id)
    assert(row!.onHand === 10, `onHand = 10 after full receipt (got ${row!.onHand})`)
    assert(row!.incoming === 0, `incoming = 0 after full receipt (got ${row!.incoming})`)
    order = await prisma.distributorOrder.findUnique({ where: { id: po.id } })
    assert(order!.status === 'delivered', 'PO delivered after full receipt')

    console.log('\nAll PO-flow smoke checks passed.')
  } finally {
    // Cleanup (order lines cascade; batches/adjustments reference the variant)
    await prisma.distributorOrder.deleteMany({ where: { externalId: poNumber } })
    await prisma.inventoryBatch.deleteMany({ where: { variantId: variant.id } })
    await prisma.inventoryAdjustment.deleteMany({ where: { variantId: variant.id } })
    await prisma.productVariant.delete({ where: { id: variant.id } })
    await prisma.product.delete({ where: { id: product.id } })
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
