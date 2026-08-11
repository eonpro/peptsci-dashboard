/**
 * Resolve the Stripe PaymentIntent that should be refunded for an order.
 *
 * Direct card charges store the PI on Order. White-label Shopify (and some
 * invoice-settled) orders are CAPTURED via InvoicePayment without copying the
 * PI onto the Order — refunds must follow invoice → InvoicePayment (then
 * SalesRecord) and backfill the Order when found.
 */

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export type PaymentIntentSource = 'order' | 'invoice' | 'sales_record'

export type PickedPaymentIntent = {
  paymentIntentId: string | null
  source: PaymentIntentSource | null
}

/**
 * Pure picker used by resolveOrderPaymentIntentId and unit tests.
 * Priority: Order PI → first invoice payment PI → SalesRecord PI.
 */
export function pickRefundablePaymentIntentId(input: {
  orderPaymentIntentId?: string | null
  invoicePaymentIntentIds?: Array<string | null | undefined>
  salesRecordPaymentIntentId?: string | null
}): PickedPaymentIntent {
  const orderPi = input.orderPaymentIntentId?.trim() || null
  if (orderPi) return { paymentIntentId: orderPi, source: 'order' }

  for (const raw of input.invoicePaymentIntentIds ?? []) {
    const pi = raw?.trim() || null
    if (pi) return { paymentIntentId: pi, source: 'invoice' }
  }

  const salesPi = input.salesRecordPaymentIntentId?.trim() || null
  if (salesPi) return { paymentIntentId: salesPi, source: 'sales_record' }

  return { paymentIntentId: null, source: null }
}

export type ResolvePaymentIntentResult = PickedPaymentIntent & {
  /** True when Order.stripePaymentIntentId was written from invoice/SalesRecord. */
  backfilled: boolean
}

/**
 * Look up the refundable PaymentIntent for an order and optionally persist it
 * onto Order.stripePaymentIntentId when discovered via invoice or SalesRecord.
 */
export async function resolveOrderPaymentIntentId(
  orderId: string,
  opts: { backfill?: boolean } = {}
): Promise<ResolvePaymentIntentResult> {
  const backfill = opts.backfill !== false
  if (!prisma) return { paymentIntentId: null, source: null, backfilled: false }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      stripePaymentIntentId: true,
      invoiceLineItems: {
        select: {
          invoice: {
            select: {
              payments: {
                where: { stripePaymentIntentId: { not: null } },
                orderBy: { paidAt: 'asc' },
                select: { stripePaymentIntentId: true },
              },
            },
          },
        },
        take: 1,
      },
      shopifyInbound: { select: { invoiceId: true } },
    },
  })
  if (!order) return { paymentIntentId: null, source: null, backfilled: false }

  let invoicePaymentIntentIds =
    order.invoiceLineItems[0]?.invoice.payments.map((p) => p.stripePaymentIntentId) ?? []

  // Shopify white-label: invoice may exist on inbound even if line→order link failed.
  if (invoicePaymentIntentIds.length === 0 && order.shopifyInbound?.invoiceId) {
    const payments = await prisma.invoicePayment.findMany({
      where: {
        invoiceId: order.shopifyInbound.invoiceId,
        stripePaymentIntentId: { not: null },
      },
      orderBy: { paidAt: 'asc' },
      select: { stripePaymentIntentId: true },
    })
    invoicePaymentIntentIds = payments.map((p) => p.stripePaymentIntentId)
  }

  const salesRecord = await prisma.salesRecord.findFirst({
    where: { orderId: order.id, stripePaymentIntentId: { not: null } },
    select: { stripePaymentIntentId: true },
  })

  const picked = pickRefundablePaymentIntentId({
    orderPaymentIntentId: order.stripePaymentIntentId,
    invoicePaymentIntentIds,
    salesRecordPaymentIntentId: salesRecord?.stripePaymentIntentId,
  })

  if (!picked.paymentIntentId || picked.source === 'order' || !backfill) {
    return { ...picked, backfilled: false }
  }

  try {
    await prisma.order.update({
      where: { id: order.id },
      data: { stripePaymentIntentId: picked.paymentIntentId },
    })
    return { ...picked, backfilled: true }
  } catch (err) {
    // Unique conflict: another order already owns this PI — still refundable
    // via the resolved id; just don't attach it.
    logger.warn('[payment-intent] could not backfill Order.stripePaymentIntentId', {
      orderId: order.id,
      paymentIntentId: picked.paymentIntentId,
      source: picked.source,
      error: err instanceof Error ? err.message : String(err),
    })
    return { ...picked, backfilled: false }
  }
}
