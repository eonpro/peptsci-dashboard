/**
 * When a product-only platform invoice becomes PAID, mint a fulfillable Order
 * so Recent Orders shows `#orderNumber` (not a Stripe `pi_…`), stock is
 * reserved, and Fulfillment can ship/consume.
 *
 * Mirrors Shopify's invoice-first → Order-after-PAID flow.
 */

import { Prisma } from '@prisma/client'
import { prisma } from '../prisma'
import { logger } from '../logger'
import { createManualOrder } from '../orders/create'
import { resolveOrderCreatorId } from '../orders/actor'
import { reserveForOrder } from '../inventory/reservations'
import { syncSalesRecordFromOrder } from '../sales'
import { accrueCommissionForOrder } from '../partners/accrual'
import { formatInvoiceNumber } from './core'
import {
  matchVariantIdFromDescription,
  normalizeProductDescription,
} from './match-variant'

export {
  matchVariantIdFromDescription,
  normalizeProductDescription,
} from './match-variant'

export type CatalogInvoiceLine = {
  id: string
  variantId: string
  quantity: number
  unitPrice: number
  amount: number
  orderId: string | null
}

/** Merge duplicate variants (sum qty; keep first unit price). */
export function mergeCatalogLinesForOrder(
  lines: Array<{ variantId: string; quantity: number; unitPrice: number }>
): Array<{ variantId: string; quantity: number; unitPrice: number }> {
  const map = new Map<string, { variantId: string; quantity: number; unitPrice: number }>()
  for (const li of lines) {
    const existing = map.get(li.variantId)
    if (!existing) {
      map.set(li.variantId, {
        variantId: li.variantId,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
      })
    } else {
      existing.quantity += li.quantity
    }
  }
  return Array.from(map.values())
}

/**
 * Product-invoice mint ships to the practice. Shopify inbounds already have a
 * dedicated fulfill path (patient ship-to). Never fall through to practice.
 */
export function platformInvoiceMintBlockReason(input: {
  hasShopifyInbound: boolean
}): string | null {
  return input.hasShopifyInbound ? 'shopify_inbound' : null
}

export type FulfillPlatformInvoiceResult =
  | { status: 'created'; orderId: string; orderNumber: number }
  | { status: 'already_linked'; orderId: string }
  | { status: 'skipped'; reason: string }

/**
 * Idempotent: create a CAPTURED Order from unlinked catalog lines on a PAID
 * invoice, reserve stock, and sync SalesRecord to `#orderNumber`.
 */
export async function fulfillPlatformInvoiceProducts(
  invoiceId: string
): Promise<FulfillPlatformInvoiceResult> {
  if (!prisma) return { status: 'skipped', reason: 'db_unavailable' }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      lineItems: { orderBy: { createdAt: 'asc' } },
      payments: { orderBy: { paidAt: 'desc' }, take: 5 },
      client: { select: { id: true, shippingAddress: true } },
      shopifyInbound: { select: { id: true } },
    },
  })
  if (!invoice) return { status: 'skipped', reason: 'not_found' }
  if (invoice.status !== 'PAID') return { status: 'skipped', reason: 'not_paid' }

  const shopifyBlock = platformInvoiceMintBlockReason({
    hasShopifyInbound: Boolean(invoice.shopifyInbound),
  })
  if (shopifyBlock) return { status: 'skipped', reason: shopifyBlock }

  // Already minted a fulfillment Order from catalog lines on this invoice.
  // (Order-rollup lines also have orderId — those are the *billed* orders, not
  // a product-invoice mint, so ignore them.)
  const catalogLinked = invoice.lineItems.find((l) => l.variantId && l.orderId)
  if (catalogLinked?.orderId) {
    return { status: 'already_linked', orderId: catalogLinked.orderId }
  }

  // Description-matched backfill may have set variantId without orderId; also
  // treat any prior mint linked via first catalog line after repair.
  const anyMintLink = invoice.lineItems.find(
    (l) => l.orderId && !l.description.startsWith('Order #')
  )
  if (anyMintLink?.orderId) {
    return { status: 'already_linked', orderId: anyMintLink.orderId }
  }

  let catalogLines: CatalogInvoiceLine[] = invoice.lineItems
    .filter((l) => l.variantId)
    .map((l) => ({
      id: l.id,
      variantId: l.variantId!,
      quantity: l.quantity,
      unitPrice: Number(l.unitPrice),
      amount: Number(l.amount),
      orderId: l.orderId,
    }))

  // Backfill path: resolve variantId from description when column was null.
  if (catalogLines.length === 0) {
    const unresolved = invoice.lineItems.filter((l) => !l.orderId && !l.description.startsWith('Order #'))
    if (unresolved.length === 0) {
      return { status: 'skipped', reason: 'no_catalog_lines' }
    }
    const variants = await prisma.productVariant.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, sku: true, dose: true, product: { select: { name: true } } },
    })
    const catalog = variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      productName: v.product.name,
      dose: v.dose,
    }))
    const matched: CatalogInvoiceLine[] = []
    for (const li of unresolved) {
      const variantId = matchVariantIdFromDescription(li.description, catalog)
      if (!variantId) continue
      matched.push({
        id: li.id,
        variantId,
        quantity: li.quantity,
        unitPrice: Number(li.unitPrice),
        amount: Number(li.amount),
        orderId: null,
      })
      await prisma.invoiceLineItem
        .update({ where: { id: li.id }, data: { variantId } })
        .catch(() => {})
    }
    catalogLines = matched
  }

  if (catalogLines.length === 0) {
    return { status: 'skipped', reason: 'no_catalog_lines' }
  }

  const merged = mergeCatalogLinesForOrder(catalogLines)
  const expectedTotal =
    Math.round(catalogLines.reduce((s, l) => s + l.amount, 0) * 100) / 100

  const stripePaymentIntentId =
    invoice.payments.find((p) => p.stripePaymentIntentId)?.stripePaymentIntentId ?? null

  // Guard: PI already has an Order (e.g. manual stripe-convert).
  if (stripePaymentIntentId) {
    const existingOrder = await prisma.order.findFirst({
      where: { stripePaymentIntentId },
      select: { id: true, orderNumber: true },
    })
    if (existingOrder) {
      const linkable =
        invoice.lineItems.find((l) => !l.orderId && !l.description.startsWith('Order #')) ??
        invoice.lineItems.find((l) => !l.orderId)
      if (linkable) {
        await prisma.invoiceLineItem
          .update({ where: { id: linkable.id }, data: { orderId: existingOrder.id } })
          .catch(() => {})
      }
      await adoptOrphanSalesRecord(stripePaymentIntentId, existingOrder.id, existingOrder.orderNumber)
      // Idempotent — covers converts that minted before accrual was wired.
      await accrueCommissionForOrder(existingOrder.id).catch((e) =>
        logger.warn('[invoicing] partner accrual failed on already_linked (non-blocking)', {
          orderId: existingOrder.id,
          invoiceId,
          error: e instanceof Error ? e.message : String(e),
        })
      )
      return { status: 'already_linked', orderId: existingOrder.id }
    }
  }

  let createdById: string
  try {
    createdById = await resolveOrderCreatorId(invoice.createdById)
  } catch {
    return { status: 'skipped', reason: 'no_order_actor' }
  }

  const order = await createManualOrder({
    clientId: invoice.clientId,
    createdById,
    lines: merged,
    source: 'STRIPE_INVOICE',
    status: 'SUBMITTED',
    paymentStatus: 'CAPTURED',
    paidAt: invoice.paidAt ?? new Date(),
    shipTo: 'PRACTICE',
    shipSpeed: 'TWO_DAY',
    shippingAddress: (invoice.client.shippingAddress as Prisma.InputJsonValue) ?? null,
    stripePaymentIntentId,
    shippingTotalOverride: 0,
    expectedTotal,
    notes: `Platform invoice ${formatInvoiceNumber(invoice.invoiceNumber)}`,
    internalNotes: [
      `invoice: ${formatInvoiceNumber(invoice.invoiceNumber)}`,
      stripePaymentIntentId ? `pi: ${stripePaymentIntentId}` : null,
      'Paid via platform invoice',
    ]
      .filter(Boolean)
      .join(' | '),
  })

  // orderId is unique on InvoiceLineItem — link one line for AR settlement history.
  const linkable = catalogLines[0]
  await prisma.invoiceLineItem.update({
    where: { id: linkable.id },
    data: { orderId: order.id },
  })

  // Replace orphan Stripe-ingest SalesRecord (pi_ as orderRef) with Order sync.
  if (stripePaymentIntentId) {
    await adoptOrphanSalesRecord(stripePaymentIntentId, order.id, order.orderNumber)
  }
  await syncSalesRecordFromOrder(order.id)

  await reserveForOrder(order.id).catch((e) =>
    logger.warn('[invoicing] reserveForOrder failed after invoice fulfill (non-blocking)', {
      orderId: order.id,
      invoiceId,
      error: e instanceof Error ? e.message : String(e),
    })
  )

  // settleOrdersForPaidInvoice only accrues pre-linked orders; this mint is new.
  await accrueCommissionForOrder(order.id).catch((e) =>
    logger.warn('[invoicing] partner accrual failed after invoice fulfill (non-blocking)', {
      orderId: order.id,
      invoiceId,
      error: e instanceof Error ? e.message : String(e),
    })
  )

  logger.info('[invoicing] minted Order from paid product invoice', {
    invoiceId,
    invoiceNumber: invoice.invoiceNumber,
    orderId: order.id,
    orderNumber: order.orderNumber,
  })

  return { status: 'created', orderId: order.id, orderNumber: order.orderNumber }
}

/**
 * If Stripe sales-ingest created a row keyed by PI (orderRef=pi_…), retarget it
 * to the real Order so Recent Orders shows `#N` and revenue is not double-counted.
 */
async function adoptOrphanSalesRecord(
  stripePaymentIntentId: string,
  orderId: string,
  orderNumber: number
): Promise<void> {
  if (!prisma) return
  const orphan = await prisma.salesRecord.findUnique({
    where: { stripePaymentIntentId },
    select: { id: true, orderId: true, source: true },
  })
  if (!orphan) return
  if (orphan.orderId && orphan.orderId !== orderId) return

  // Drop the orphan so syncSalesRecordFromOrder can upsert by orderId with the
  // same PI unique key (source: order, orderRef: #N).
  if (!orphan.orderId || orphan.source === 'stripe') {
    await prisma.salesRecord.delete({ where: { id: orphan.id } }).catch(() => {})
  } else {
    await prisma.salesRecord.update({
      where: { id: orphan.id },
      data: { orderRef: `#${orderNumber}`, orderId },
    })
  }
}
