/**
 * One-shot ops: probe INV-00001 + optionally queue fulfillment.
 * Usage:
 *   npx tsx --env-file=.env.local scripts/ops-inv00001-fulfill.ts
 *   ALLOW_REMOTE_SEED=1 npx tsx --env-file=.env.local scripts/ops-inv00001-fulfill.ts --fulfill
 */
import { prisma } from '../lib/prisma'
import { assertLocalOrExplicitOverride } from '../lib/db-url'
import { fulfillPlatformInvoiceProducts } from '../lib/invoicing/fulfill-products'
import { formatInvoiceNumber } from '../lib/invoicing/core'

assertLocalOrExplicitOverride('ops-inv00001-fulfill')

const doFulfill = process.argv.includes('--fulfill')

async function main() {
  if (!prisma) {
    console.error('prisma unavailable')
    process.exit(1)
  }

  const cols = (await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'InvoiceLineItem' AND column_name = 'variantId'`
  )) as Array<{ column_name: string }>
  console.log('variantId column present:', cols.length > 0)

  const inv = await prisma.invoice.findFirst({
    where: { invoiceNumber: 1 },
    include: {
      lineItems: true,
      payments: true,
      client: { select: { organizationName: true } },
    },
  })
  if (!inv) {
    console.log('INV-00001 not found in this database')
    return
  }

  console.log(
    JSON.stringify(
      {
        id: inv.id,
        label: formatInvoiceNumber(inv.invoiceNumber),
        status: inv.status,
        client: inv.client.organizationName,
        lines: inv.lineItems.map((l) => ({
          description: l.description,
          variantId: l.variantId,
          orderId: l.orderId,
          qty: l.quantity,
          amount: Number(l.amount),
        })),
        payments: inv.payments.map((p) => ({
          amount: Number(p.amount),
          stripePaymentIntentId: p.stripePaymentIntentId,
        })),
      },
      null,
      2
    )
  )

  const pi = inv.payments[0]?.stripePaymentIntentId
  if (pi) {
    const orphan = await prisma.salesRecord.findUnique({
      where: { stripePaymentIntentId: pi },
      select: { id: true, orderId: true, product: true, paidAmount: true, source: true },
    })
    console.log('SalesRecord for PI:', orphan)
  }

  if (!doFulfill) {
    console.log('Dry run only. Re-run with --fulfill to mint the Order.')
    return
  }

  const result = await fulfillPlatformInvoiceProducts(inv.id)
  console.log('fulfill result:', result)

  if (pi) {
    const after = await prisma.salesRecord.findUnique({
      where: { stripePaymentIntentId: pi },
      select: { id: true, orderId: true, orderRef: true, source: true },
    })
    console.log('SalesRecord after:', after)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma?.$disconnect()
  })
