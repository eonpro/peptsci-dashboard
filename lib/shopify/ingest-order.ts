/**
 * Ingest a paid Shopify order into a PeptSci fulfillment Order (source SHOPIFY).
 * Billing: PeptSci B2B account pricing + practice shipping; attempt off-session
 * charge of the practice card on file. Order stays PENDING/FAILED if charge
 * cannot run so admins can collect later (payment gate blocks ship until CAPTURED).
 */

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { createManualOrder, type CreateManualOrderResult } from '@/lib/orders/create'
import { ManualOrderError } from '@/lib/orders/order-core'
import { reserveForOrder } from '@/lib/inventory/reservations'
import { chargeOrderWithSavedCard } from '@/lib/stripe/charge-saved-card'
import { fromShopifyShippingAddress, type ShopifyAddressLike } from './address'
import { shopifyGidToNumeric } from './ids'
import { mapShopifyShipSpeed } from './ship-speed'

export type ShopifyLineItem = {
  id?: number | string
  variant_id?: number | string | null
  sku?: string | null
  title?: string | null
  quantity?: number
  fulfillable_quantity?: number
  requires_shipping?: boolean
}

export type ShopifyOrderPayload = {
  id?: number | string
  admin_graphql_api_id?: string | null
  name?: string | null
  email?: string | null
  phone?: string | null
  note?: string | null
  cancelled_at?: string | null
  financial_status?: string | null
  total_price?: string | null
  subtotal_price?: string | null
  total_tax?: string | null
  total_shipping_price_set?: { shop_money?: { amount?: string } } | null
  shipping_address?: ShopifyAddressLike | null
  billing_address?: ShopifyAddressLike | null
  shipping_lines?: Array<{ title?: string | null; code?: string | null }>
  line_items?: ShopifyLineItem[]
  fulfillment_orders?: Array<{ id?: number | string; admin_graphql_api_id?: string }>
}

export type IngestShopifyOrderResult =
  | {
      status: 'created'
      order: CreateManualOrderResult
      shopifyOrderId: string
      chargeStatus: string
    }
  | { status: 'duplicate'; orderId: string; orderNumber: number }
  | { status: 'skipped'; reason: string }
  | { status: 'error'; code: string; message: string }

function lineVariantKey(li: ShopifyLineItem): string | null {
  return shopifyGidToNumeric(li.variant_id ?? null)
}

/**
 * Map Shopify line items → PeptSci variant lines using ShopifyVariantMapping.
 * Returns error when any shippable line cannot be mapped.
 */
export async function resolveShopifyLines(
  connectionId: string,
  lineItems: ShopifyLineItem[]
): Promise<
  | { ok: true; lines: Array<{ variantId: string; quantity: number }> }
  | { ok: false; unmapped: Array<{ shopifyVariantId: string | null; sku: string | null; title: string | null }> }
> {
  if (!prisma) return { ok: false, unmapped: [] }

  const shippable = lineItems.filter((li) => {
    if (li.requires_shipping === false) return false
    const qty = Number(li.quantity ?? 0)
    return qty > 0
  })

  if (shippable.length === 0) {
    return { ok: false, unmapped: [{ shopifyVariantId: null, sku: null, title: 'no shippable lines' }] }
  }

  const mappings = await prisma.shopifyVariantMapping.findMany({
    where: { connectionId },
    select: { shopifyVariantId: true, shopifySku: true, variantId: true },
  })

  const byVariantId = new Map<string, string>()
  const bySku = new Map<string, string>()
  for (const m of mappings) {
    const num = shopifyGidToNumeric(m.shopifyVariantId) || m.shopifyVariantId
    byVariantId.set(num, m.variantId)
    byVariantId.set(m.shopifyVariantId, m.variantId)
    if (m.shopifySku?.trim()) bySku.set(m.shopifySku.trim().toLowerCase(), m.variantId)
  }

  const lines: Array<{ variantId: string; quantity: number }> = []
  const unmapped: Array<{ shopifyVariantId: string | null; sku: string | null; title: string | null }> =
    []

  for (const li of shippable) {
    const key = lineVariantKey(li)
    const sku = li.sku?.trim() || null
    let variantId = key ? byVariantId.get(key) : undefined
    if (!variantId && sku) variantId = bySku.get(sku.toLowerCase())
    const qty = Math.max(0, Math.floor(Number(li.quantity) || 0))
    if (!variantId || qty < 1) {
      unmapped.push({ shopifyVariantId: key, sku, title: li.title ?? null })
      continue
    }
    lines.push({ variantId, quantity: qty })
  }

  if (unmapped.length) return { ok: false, unmapped }
  return { ok: true, lines }
}

export async function ingestShopifyPaidOrder(params: {
  connectionId: string
  clientId: string
  payload: ShopifyOrderPayload
}): Promise<IngestShopifyOrderResult> {
  if (!prisma) return { status: 'error', code: 'DB_UNAVAILABLE', message: 'Database not connected' }

  const { connectionId, clientId, payload } = params
  const shopifyOrderId =
    shopifyGidToNumeric(payload.admin_graphql_api_id) ||
    shopifyGidToNumeric(payload.id) ||
    null

  if (!shopifyOrderId) {
    return { status: 'error', code: 'MISSING_ORDER_ID', message: 'Shopify order id missing' }
  }

  if (payload.cancelled_at) {
    return { status: 'skipped', reason: 'order_cancelled' }
  }

  const existing = await prisma.order.findFirst({
    where: { clientId, shopifyOrderId },
    select: { id: true, orderNumber: true },
  })
  if (existing) {
    return { status: 'duplicate', orderId: existing.id, orderNumber: existing.orderNumber }
  }

  const mapped = await resolveShopifyLines(connectionId, payload.line_items ?? [])
  if (!mapped.ok) {
    const detail = mapped.unmapped
      .map((u) => u.sku || u.shopifyVariantId || u.title || '?')
      .join(', ')
    return {
      status: 'error',
      code: 'UNMAPPED_VARIANTS',
      message: `Unmapped Shopify variants: ${detail}`,
    }
  }

  // Attribute to any user on the client (same as storefront).
  const clientUser = await prisma.user.findFirst({
    where: { clientId },
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

  const shipping =
    fromShopifyShippingAddress(payload.shipping_address, payload.phone) ||
    fromShopifyShippingAddress(payload.billing_address, payload.phone)

  const foId =
    shopifyGidToNumeric(payload.fulfillment_orders?.[0]?.admin_graphql_api_id) ||
    shopifyGidToNumeric(payload.fulfillment_orders?.[0]?.id) ||
    null

  const orderName = payload.name?.trim() || `#${shopifyOrderId}`
  const shipSpeed = mapShopifyShipSpeed(payload.shipping_lines)
  const internalNotes = [
    `Shopify order ${orderName}`,
    payload.email ? `buyer: ${payload.email}` : null,
    payload.financial_status ? `financial_status: ${payload.financial_status}` : null,
    `shipSpeed: ${shipSpeed}`,
    'Shopify retail paid by buyer — PeptSci B2B charge attempted on card on file',
  ]
    .filter(Boolean)
    .join(' | ')

  try {
    const order = await createManualOrder({
      clientId,
      createdById: clientUser.id,
      lines: mapped.lines,
      source: 'SHOPIFY',
      status: 'SUBMITTED',
      paymentStatus: 'PENDING',
      shipTo: 'PATIENT',
      shipSpeed,
      shippingAddress: shipping
        ? (shipping as unknown as Prisma.InputJsonValue)
        : null,
      notes: payload.note?.trim() || null,
      internalNotes,
      shopifyConnectionId: connectionId,
      shopifyOrderId,
      shopifyOrderName: orderName,
      shopifyFulfillmentOrderId: foId,
    })

    let chargeStatus = 'pending'
    try {
      const charged = await chargeOrderWithSavedCard({
        orderId: order.id,
        idempotencyKey: `pi_shopify_${order.id}`,
        metadata: { source: 'shopify', shopifyOrderId },
      })
      chargeStatus = charged.status
      if (charged.status === 'no_card') {
        logger.info('[shopify] shopify_charge_skipped_no_card', {
          orderId: order.id,
          shopifyOrderId,
          clientId,
        })
      } else if (charged.status === 'captured') {
        logger.info('[shopify] shopify_charge_captured', {
          orderId: order.id,
          shopifyOrderId,
          paymentIntentId: charged.paymentIntentId,
        })
      } else if (charged.status === 'failed' || charged.status === 'requires_action') {
        logger.warn('[shopify] shopify_charge_unpaid', {
          orderId: order.id,
          shopifyOrderId,
          chargeStatus: charged.status,
          message: 'message' in charged ? charged.message : undefined,
        })
      } else if (charged.status === 'stripe_unconfigured') {
        logger.warn('[shopify] shopify_charge_skipped_stripe', {
          orderId: order.id,
          message: charged.message,
        })
      }
    } catch (chargeErr) {
      chargeStatus = 'error'
      logger.error(
        '[shopify] shopify_charge_exception — order left unpaid',
        {
          orderId: order.id,
          shopifyOrderId,
          error: chargeErr instanceof Error ? chargeErr.message : String(chargeErr),
        },
        chargeErr instanceof Error ? chargeErr : undefined
      )
    }

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
        logger.error(
          '[shopify] reserveForOrder failed after retry — order has NO stock reservation',
          {
            orderId: order.id,
            error: err2 instanceof Error ? err2.message : String(err2),
          }
        )
      }
    }

    logger.info('[shopify] order ingested', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      shopifyOrderId,
      clientId,
      shipSpeed,
      chargeStatus,
    })

    return { status: 'created', order, shopifyOrderId, chargeStatus }
  } catch (err) {
    if (err instanceof ManualOrderError) {
      return { status: 'error', code: err.code, message: err.message }
    }
    // Unique race on (clientId, shopifyOrderId)
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('Unique constraint') || message.includes('shopifyOrderId')) {
      const again = await prisma.order.findFirst({
        where: { clientId, shopifyOrderId },
        select: { id: true, orderNumber: true },
      })
      if (again) return { status: 'duplicate', orderId: again.id, orderNumber: again.orderNumber }
    }
    return { status: 'error', code: 'INGEST_FAILED', message }
  }
}

/** Cancel an open PeptSci order when Shopify cancels (if not yet shipped). */
export async function cancelShopifyLinkedOrder(params: {
  clientId: string
  shopifyOrderId: string
}): Promise<{ status: 'cancelled' | 'noop' | 'not_found'; orderId?: string }> {
  if (!prisma) return { status: 'not_found' }
  const shopifyOrderId = shopifyGidToNumeric(params.shopifyOrderId) || params.shopifyOrderId
  const order = await prisma.order.findFirst({
    where: { clientId: params.clientId, shopifyOrderId },
    select: { id: true, status: true, trackingNumber: true, internalNotes: true },
  })
  if (!order) return { status: 'not_found' }
  if (order.trackingNumber || ['SHIPPED', 'COMPLETED', 'CANCELLED'].includes(order.status)) {
    return { status: 'noop', orderId: order.id }
  }

  const note = 'Cancelled on Shopify'
  const internalNotes = order.internalNotes?.trim()
    ? `${order.internalNotes} | ${note}`
    : note

  await prisma.order.update({
    where: { id: order.id },
    data: { status: 'CANCELLED', internalNotes },
  })

  const { releaseForOrder } = await import('@/lib/inventory/reservations')
  await releaseForOrder(order.id).catch(() => {})

  return { status: 'cancelled', orderId: order.id }
}
