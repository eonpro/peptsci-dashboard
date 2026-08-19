/**
 * Process a fully-mapped ShopifyInboundOrder:
 *   invoice (client pricing + shipping) → charge card on file → create CAPTURED Order.
 */

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveEffectiveUnitPrice } from '@/lib/access'
import { computeShipping, type ShipSpeed } from '@/lib/checkout-core'
import { displayProductName } from '@/lib/products/named-blends'
import { createInvoice, getInvoice } from '@/lib/invoicing/service'
import { createManualOrder } from '@/lib/orders/create'
import { reserveForOrder } from '@/lib/inventory/reservations'
import { accrueCommissionForOrder } from '@/lib/partners/accrual'
import { chargeInvoiceWithSavedCard } from '@/lib/stripe/charge-invoice-saved-card'
import { syncSalesRecordFromOrder } from '@/lib/sales'
import {
  buildShopifyInvoiceLines,
  inboundLinesFullyMapped,
  mergeMappedInboundLines,
  type PricedInboundLine,
} from './inbound-core'
import {
  enrichShippingAddressWithBuyer,
  upsertPatientFromShipTo,
} from '@/lib/patients/upsert-from-ship-to'

export type ProcessShopifyInboundResult =
  | {
      status: 'fulfillment_queued'
      inboundId: string
      invoiceId: string
      orderId: string
      orderNumber: number
      chargeStatus: string
    }
  | {
      status: 'invoiced_unpaid'
      inboundId: string
      invoiceId: string
      chargeStatus: string
      message?: string
    }
  | { status: 'needs_mapping'; inboundId: string }
  | { status: 'already_queued'; inboundId: string; orderId: string }
  | { status: 'cancelled'; inboundId: string }
  | { status: 'error'; code: string; message: string }

async function priceInboundLines(
  clientId: string,
  lines: Array<{ variantId: string; quantity: number; shopifyTitle: string }>
): Promise<PricedInboundLine[]> {
  if (!prisma) throw new Error('Database not connected')

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      paysAtCost: true,
      shippingRateTwoDay: true,
      shippingRateOvernight: true,
    },
  })
  if (!client) throw new Error('Client not found')

  const variantIds = lines.map((l) => l.variantId)
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds }, status: 'ACTIVE' },
    include: {
      product: { select: { name: true } },
      clientPricing: {
        where: {
          clientId,
          isActive: true,
          AND: [
            { OR: [{ validFrom: null }, { validFrom: { lte: new Date() } }] },
            { OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }] },
          ],
        },
      },
    },
  })
  const byId = new Map(variants.map((v) => [v.id, v]))

  const priced: PricedInboundLine[] = []
  for (const line of lines) {
    const v = byId.get(line.variantId)
    if (!v) throw new Error(`Variant ${line.variantId} is not available`)
    const custom = v.clientPricing[0]
    const { price } = resolveEffectiveUnitPrice({
      srp: Number(v.srp),
      customPrice: custom ? Number(custom.customPrice) : null,
      unitCost: Number(v.unitCost),
      paysAtCost: client.paysAtCost,
    })
    if (price <= 0) {
      throw new Error(`"${displayProductName(v.product.name, v.sku)}" has no price for this client`)
    }
    priced.push({
      variantId: v.id,
      description: `${displayProductName(v.product.name, v.sku)}${v.dose ? ` ${v.dose}` : ''} (${v.sku})`,
      quantity: line.quantity,
      unitPrice: price,
    })
  }
  return priced
}

async function shippingOverridesForClient(clientId: string) {
  if (!prisma) return { twoDay: null, overnight: null }
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { shippingRateTwoDay: true, shippingRateOvernight: true },
  })
  return {
    twoDay: client?.shippingRateTwoDay != null ? Number(client.shippingRateTwoDay) : null,
    overnight: client?.shippingRateOvernight != null ? Number(client.shippingRateOvernight) : null,
  }
}

/**
 * After an inbound's invoice is PAID, create the CAPTURED fulfillment Order
 * (idempotent if order already linked).
 */
export async function fulfillShopifyInboundAfterInvoicePaid(
  inboundId: string
): Promise<ProcessShopifyInboundResult> {
  if (!prisma) return { status: 'error', code: 'DB_UNAVAILABLE', message: 'Database not connected' }

  const inbound = await prisma.shopifyInboundOrder.findUnique({
    where: { id: inboundId },
    include: { lines: true },
  })
  if (!inbound) return { status: 'error', code: 'NOT_FOUND', message: 'Inbound not found' }
  if (inbound.status === 'CANCELLED') return { status: 'cancelled', inboundId }
  if (inbound.orderId) {
    return { status: 'already_queued', inboundId, orderId: inbound.orderId }
  }
  if (!inbound.invoiceId) {
    return { status: 'error', code: 'NO_INVOICE', message: 'Inbound has no invoice' }
  }

  const invoiceView = await getInvoice(inbound.invoiceId)
  if (!invoiceView || invoiceView.invoice.status !== 'PAID') {
    return {
      status: 'invoiced_unpaid',
      inboundId,
      invoiceId: inbound.invoiceId,
      chargeStatus: invoiceView?.invoice.status ?? 'unknown',
      message: 'Invoice is not paid yet',
    }
  }

  if (!inboundLinesFullyMapped(inbound.lines)) {
    return { status: 'needs_mapping', inboundId }
  }

  const clientUser = await prisma.user.findFirst({
    where: { clientId: inbound.clientId },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })
  if (!clientUser) {
    return {
      status: 'error',
      code: 'NO_CLIENT_USER',
      message: 'Client has no user to attribute the order to',
    }
  }

  const mappedLines = mergeMappedInboundLines(
    inbound.lines.map((l) => ({
      variantId: l.variantId,
      quantity: l.quantity,
    }))
  )
  if (mappedLines.length === 0) {
    return { status: 'error', code: 'NO_LINES', message: 'No mapped line items' }
  }

  const shippingAddress = enrichShippingAddressWithBuyer(
    inbound.shippingAddress,
    inbound.buyerEmail
  )
  let patientId: string | null = null
  try {
    patientId = await upsertPatientFromShipTo({
      clientId: inbound.clientId,
      shippingAddress,
      buyerEmail: inbound.buyerEmail,
    })
  } catch (err) {
    logger.warn('[shopify] patient upsert failed; continuing without patientId', {
      inboundId,
      message: err instanceof Error ? err.message : String(err),
    })
  }

  try {
    // Mirror platform invoice fulfill: copy the invoice Stripe PI onto the Order
    // so refunds hit the PeptSci charge without a separate lookup.
    const invoicePayments = await prisma.invoicePayment.findMany({
      where: {
        invoiceId: inbound.invoiceId!,
        stripePaymentIntentId: { not: null },
      },
      orderBy: { paidAt: 'asc' },
      select: { stripePaymentIntentId: true },
    })
    const stripePaymentIntentId = invoicePayments[0]?.stripePaymentIntentId ?? null

    const order = await createManualOrder({
      clientId: inbound.clientId,
      createdById: clientUser.id,
      lines: mappedLines,
      source: 'SHOPIFY',
      status: 'SUBMITTED',
      paymentStatus: 'CAPTURED',
      paidAt: invoiceView.invoice.paidAt ?? new Date(),
      shipTo: 'PATIENT',
      shipSpeed: inbound.shipSpeed as ShipSpeed,
      patientId,
      shippingAddress: (shippingAddress as Prisma.InputJsonValue) ?? null,
      stripePaymentIntentId,
      notes: inbound.buyerNote,
      internalNotes: [
        `Shopify order ${inbound.shopifyOrderName ?? inbound.shopifyOrderId}`,
        inbound.buyerEmail ? `buyer: ${inbound.buyerEmail}` : null,
        `invoice: ${invoiceView.invoice.invoiceNumber}`,
        stripePaymentIntentId ? `pi: ${stripePaymentIntentId}` : null,
        'Paid via invoice (card on file)',
      ]
        .filter(Boolean)
        .join(' | '),
      shopifyConnectionId: inbound.connectionId,
      shopifyOrderId: inbound.shopifyOrderId,
      shopifyOrderName: inbound.shopifyOrderName,
      shopifyFulfillmentOrderId: inbound.shopifyFoId,
    })

    // Link one invoice line to the order for AR settlement history.
    const linkable = await prisma.invoiceLineItem.findFirst({
      where: { invoiceId: inbound.invoiceId, orderId: null },
      orderBy: { createdAt: 'asc' },
    })
    if (linkable) {
      await prisma.invoiceLineItem
        .update({ where: { id: linkable.id }, data: { orderId: order.id } })
        .catch((e) =>
          logger.warn('[shopify] could not link invoice line to order', {
            error: e instanceof Error ? e.message : String(e),
          })
        )
    }

    await prisma.shopifyInboundOrder.update({
      where: { id: inbound.id },
      data: { orderId: order.id, status: 'FULFILLMENT_QUEUED', lastError: null },
    })

    await syncSalesRecordFromOrder(order.id).catch((e) =>
      logger.warn('[shopify] syncSalesRecordFromOrder failed (non-blocking)', {
        orderId: order.id,
        error: e instanceof Error ? e.message : String(e),
      })
    )

    try {
      await reserveForOrder(order.id)
    } catch (err) {
      logger.warn('[shopify] reserveForOrder failed; retrying once', {
        orderId: order.id,
        error: err instanceof Error ? err.message : String(err),
      })
      try {
        await reserveForOrder(order.id)
      } catch (err2) {
        logger.error('[shopify] reserveForOrder failed after retry', {
          orderId: order.id,
          error: err2 instanceof Error ? err2.message : String(err2),
        })
      }
    }

    // Invoice PAID settles pre-linked orders only; this Order is minted after.
    await accrueCommissionForOrder(order.id).catch((e) =>
      logger.warn('[shopify] partner accrual failed (non-blocking)', {
        orderId: order.id,
        inboundId: inbound.id,
        error: e instanceof Error ? e.message : String(e),
      })
    )

    return {
      status: 'fulfillment_queued',
      inboundId: inbound.id,
      invoiceId: inbound.invoiceId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      chargeStatus: 'paid',
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await prisma.shopifyInboundOrder.update({
      where: { id: inbound.id },
      data: { lastError: message.slice(0, 500) },
    })
    return { status: 'error', code: 'FULFILL_FAILED', message }
  }
}

/**
 * Create OPEN invoice (if needed), charge card on file, then queue fulfillment
 * when paid. Requires all inbound lines to be mapped.
 */
export async function processShopifyInbound(
  inboundId: string
): Promise<ProcessShopifyInboundResult> {
  if (!prisma) return { status: 'error', code: 'DB_UNAVAILABLE', message: 'Database not connected' }

  const inbound = await prisma.shopifyInboundOrder.findUnique({
    where: { id: inboundId },
    include: { lines: true },
  })
  if (!inbound) return { status: 'error', code: 'NOT_FOUND', message: 'Inbound not found' }
  if (inbound.status === 'CANCELLED') return { status: 'cancelled', inboundId }
  if (inbound.orderId) {
    return { status: 'already_queued', inboundId, orderId: inbound.orderId }
  }

  if (!inboundLinesFullyMapped(inbound.lines)) {
    await prisma.shopifyInboundOrder.update({
      where: { id: inbound.id },
      data: { status: 'NEEDS_MAPPING' },
    })
    return { status: 'needs_mapping', inboundId }
  }

  // Mark READY while we invoice.
  if (inbound.status === 'NEEDS_MAPPING') {
    await prisma.shopifyInboundOrder.update({
      where: { id: inbound.id },
      data: { status: 'READY', lastError: null },
    })
  }

  let invoiceId = inbound.invoiceId
  if (!invoiceId) {
    try {
      const priced = await priceInboundLines(
        inbound.clientId,
        inbound.lines.map((l) => ({
          variantId: l.variantId!,
          quantity: l.quantity,
          shopifyTitle: l.shopifyTitle,
        }))
      )
      const overrides = await shippingOverridesForClient(inbound.clientId)
      const shipSpeed = inbound.shipSpeed as ShipSpeed
      const subtotal = priced.reduce((s, l) => s + l.unitPrice * l.quantity, 0)
      const shippingTotal = computeShipping(subtotal, shipSpeed, overrides)
      const built = buildShopifyInvoiceLines({
        lines: priced,
        shippingTotal,
        shipSpeed,
        shopifyOrderName: inbound.shopifyOrderName ?? `#${inbound.shopifyOrderId}`,
      })

      const clientUser = await prisma.user.findFirst({
        where: { clientId: inbound.clientId },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      })

      const inv = await createInvoice({
        clientId: inbound.clientId,
        lineItems: built.lineItems,
        paymentTermsDays: 0,
        issue: true,
        notes: `Shopify ${inbound.shopifyOrderName ?? inbound.shopifyOrderId}`,
        createdById: clientUser?.id,
      })

      invoiceId = inv.invoice.id
      await prisma.shopifyInboundOrder.update({
        where: { id: inbound.id },
        data: { invoiceId, status: 'INVOICED', lastError: null },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await prisma.shopifyInboundOrder.update({
        where: { id: inbound.id },
        data: { lastError: message.slice(0, 500), status: 'READY' },
      })
      return { status: 'error', code: 'INVOICE_FAILED', message }
    }
  }

  // Charge card on file (or leave OPEN if unpaid).
  const charged = await chargeInvoiceWithSavedCard({
    invoiceId,
    metadata: {
      source: 'shopify',
      shopifyOrderId: inbound.shopifyOrderId,
      inboundId: inbound.id,
    },
  })

  if (charged.status === 'paid' || charged.status === 'nothing_due') {
    const paidView = await getInvoice(invoiceId)
    if (paidView?.invoice.status === 'PAID') {
      return fulfillShopifyInboundAfterInvoicePaid(inbound.id)
    }
  }

  const message =
    charged.status === 'no_card'
      ? 'No card on file'
      : charged.status === 'failed'
        ? charged.message
        : charged.status === 'requires_action'
          ? 'Card requires authentication'
          : charged.status === 'stripe_unconfigured'
            ? charged.message
            : 'Invoice unpaid'

  await prisma.shopifyInboundOrder.update({
    where: { id: inbound.id },
    data: {
      status: 'INVOICED',
      lastError: message.slice(0, 500),
    },
  })

  logger.info('[shopify] inbound invoiced but unpaid', {
    inboundId: inbound.id,
    invoiceId,
    chargeStatus: charged.status,
  })

  return {
    status: 'invoiced_unpaid',
    inboundId: inbound.id,
    invoiceId,
    chargeStatus: charged.status,
    message,
  }
}

/** When any invoice becomes PAID, fulfill linked Shopify inbound if present. */
export async function maybeFulfillShopifyInboundForInvoice(invoiceId: string): Promise<void> {
  if (!prisma) return
  const inbound = await prisma.shopifyInboundOrder.findFirst({
    where: { invoiceId, orderId: null, status: { not: 'CANCELLED' } },
    select: { id: true },
  })
  if (!inbound) return
  const result = await fulfillShopifyInboundAfterInvoicePaid(inbound.id)
  logger.info('[shopify] maybeFulfillShopifyInboundForInvoice', {
    invoiceId,
    inboundId: inbound.id,
    result: result.status,
  })
}
