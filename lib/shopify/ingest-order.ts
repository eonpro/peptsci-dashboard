/**
 * Ingest a paid Shopify order into a ShopifyInboundOrder hold/process pipeline.
 * Flow: upsert inbound lines → map variants → invoice at client pricing →
 * charge card on file → create CAPTURED fulfillment Order only after PAID.
 */

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { voidInvoice } from '@/lib/invoicing/service'
import { fromShopifyShippingAddress, type ShopifyAddressLike } from './address'
import { shopifyGidToNumeric } from './ids'
import { mapShopifyShipSpeed } from './ship-speed'
import { inboundLinesFullyMapped } from './inbound-core'
import { processShopifyInbound, type ProcessShopifyInboundResult } from './process-inbound'

export type ShopifyLineItem = {
  id?: number | string
  variant_id?: number | string | null
  sku?: string | null
  title?: string | null
  name?: string | null
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
      status: 'needs_mapping'
      inboundId: string
      shopifyOrderId: string
      unmappedTitles: string[]
    }
  | {
      status: 'processed'
      inboundId: string
      shopifyOrderId: string
      result: ProcessShopifyInboundResult
    }
  | { status: 'duplicate'; inboundId: string; shopifyOrderId: string; orderId?: string | null }
  | { status: 'skipped'; reason: string }
  | { status: 'error'; code: string; message: string }

function lineVariantKey(li: ShopifyLineItem): string | null {
  return shopifyGidToNumeric(li.variant_id ?? null)
}

function lineTitle(li: ShopifyLineItem): string {
  return (li.title || li.name || li.sku || 'Unknown Shopify product').trim()
}

/**
 * Resolve PeptSci variantId for a Shopify line via ShopifyVariantMapping.
 */
export async function resolveVariantIdForShopifyLine(
  connectionId: string,
  li: { shopifyVariantId: string | null; shopifySku: string | null }
): Promise<string | null> {
  if (!prisma) return null
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
  if (li.shopifyVariantId) {
    const hit = byVariantId.get(li.shopifyVariantId)
    if (hit) return hit
  }
  if (li.shopifySku?.trim()) {
    return bySku.get(li.shopifySku.trim().toLowerCase()) ?? null
  }
  return null
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

  const existing = await prisma.shopifyInboundOrder.findUnique({
    where: { clientId_shopifyOrderId: { clientId, shopifyOrderId } },
    select: { id: true, orderId: true, status: true },
  })
  if (existing && (existing.orderId || existing.status === 'FULFILLMENT_QUEUED')) {
    return {
      status: 'duplicate',
      inboundId: existing.id,
      shopifyOrderId,
      orderId: existing.orderId,
    }
  }
  // If already invoiced/queued mid-flight, re-run process (idempotent).
  if (existing && existing.status !== 'NEEDS_MAPPING' && existing.status !== 'CANCELLED') {
    const result = await processShopifyInbound(existing.id)
    return { status: 'processed', inboundId: existing.id, shopifyOrderId, result }
  }

  const shippable = (payload.line_items ?? []).filter((li) => {
    if (li.requires_shipping === false) return false
    return Math.max(0, Math.floor(Number(li.quantity) || 0)) > 0
  })
  if (shippable.length === 0) {
    return { status: 'error', code: 'NO_LINES', message: 'No shippable line items' }
  }

  const shipping =
    fromShopifyShippingAddress(payload.shipping_address, payload.phone) ||
    fromShopifyShippingAddress(payload.billing_address, payload.phone)

  const foId =
    shopifyGidToNumeric(payload.fulfillment_orders?.[0]?.admin_graphql_api_id) ||
    shopifyGidToNumeric(payload.fulfillment_orders?.[0]?.id) ||
    null

  const shipSpeed = mapShopifyShipSpeed(payload.shipping_lines)
  const orderName = payload.name?.trim() || `#${shopifyOrderId}`

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

  const lineRows: Array<{
    shopifyVariantId: string | null
    shopifySku: string | null
    shopifyTitle: string
    quantity: number
    variantId: string | null
  }> = []

  for (const li of shippable) {
    const shopifyVariantId = lineVariantKey(li)
    const shopifySku = li.sku?.trim() || null
    const shopifyTitle = lineTitle(li)
    const quantity = Math.max(1, Math.floor(Number(li.quantity) || 0))
    let variantId: string | null = null
    if (shopifyVariantId) variantId = byVariantId.get(shopifyVariantId) ?? null
    if (!variantId && shopifySku) variantId = bySku.get(shopifySku.toLowerCase()) ?? null
    lineRows.push({ shopifyVariantId, shopifySku, shopifyTitle, quantity, variantId })
  }

  const fullyMapped = inboundLinesFullyMapped(lineRows)

  let inboundId: string
  if (existing) {
    inboundId = existing.id
    await prisma.$transaction(async (tx) => {
      await tx.shopifyInboundLine.deleteMany({ where: { inboundOrderId: inboundId } })
      await tx.shopifyInboundOrder.update({
        where: { id: inboundId },
        data: {
          shopifyOrderName: orderName,
          shipSpeed,
          shippingAddress: shipping
            ? (shipping as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          buyerEmail: payload.email?.trim() || null,
          buyerNote: payload.note?.trim() || null,
          shopifyFoId: foId,
          status: fullyMapped ? 'READY' : 'NEEDS_MAPPING',
          lastError: fullyMapped
            ? null
            : `Unmapped: ${lineRows
                .filter((l) => !l.variantId)
                .map((l) => l.shopifyTitle)
                .join(', ')}`.slice(0, 500),
          lines: {
            create: lineRows.map((l) => ({
              shopifyVariantId: l.shopifyVariantId,
              shopifySku: l.shopifySku,
              shopifyTitle: l.shopifyTitle,
              quantity: l.quantity,
              variantId: l.variantId,
            })),
          },
        },
      })
    })
  } else {
    const created = await prisma.shopifyInboundOrder.create({
      data: {
        connectionId,
        clientId,
        shopifyOrderId,
        shopifyOrderName: orderName,
        shipSpeed,
        shippingAddress: shipping
          ? (shipping as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        buyerEmail: payload.email?.trim() || null,
        buyerNote: payload.note?.trim() || null,
        shopifyFoId: foId,
        status: fullyMapped ? 'READY' : 'NEEDS_MAPPING',
        lastError: fullyMapped
          ? null
          : `Unmapped: ${lineRows
              .filter((l) => !l.variantId)
              .map((l) => l.shopifyTitle)
              .join(', ')}`.slice(0, 500),
        lines: {
          create: lineRows.map((l) => ({
            shopifyVariantId: l.shopifyVariantId,
            shopifySku: l.shopifySku,
            shopifyTitle: l.shopifyTitle,
            quantity: l.quantity,
            variantId: l.variantId,
          })),
        },
      },
      select: { id: true },
    })
    inboundId = created.id
  }

  if (!fullyMapped) {
    const unmappedTitles = lineRows.filter((l) => !l.variantId).map((l) => l.shopifyTitle)
    await prisma.shopifyConnection.update({
      where: { id: connectionId },
      data: {
        lastError: `Needs mapping: ${unmappedTitles.join(', ')}`.slice(0, 500),
      },
    })
    logger.info('[shopify] inbound needs mapping', {
      inboundId,
      shopifyOrderId,
      unmappedTitles,
    })
    return { status: 'needs_mapping', inboundId, shopifyOrderId, unmappedTitles }
  }

  const result = await processShopifyInbound(inboundId)
  logger.info('[shopify] inbound processed', {
    inboundId,
    shopifyOrderId,
    result: result.status,
  })
  return { status: 'processed', inboundId, shopifyOrderId, result }
}

/** Cancel an open PeptSci order / inbound when Shopify cancels. */
export async function cancelShopifyLinkedOrder(params: {
  clientId: string
  shopifyOrderId: string
}): Promise<{ status: 'cancelled' | 'noop' | 'not_found'; orderId?: string; inboundId?: string }> {
  if (!prisma) return { status: 'not_found' }
  const shopifyOrderId = shopifyGidToNumeric(params.shopifyOrderId) || params.shopifyOrderId

  const inbound = await prisma.shopifyInboundOrder.findUnique({
    where: {
      clientId_shopifyOrderId: { clientId: params.clientId, shopifyOrderId },
    },
    select: { id: true, status: true, invoiceId: true, orderId: true },
  })

  if (inbound) {
    if (inbound.status !== 'FULFILLMENT_QUEUED' && inbound.status !== 'CANCELLED') {
      if (inbound.invoiceId) {
        const inv = await prisma.invoice.findUnique({
          where: { id: inbound.invoiceId },
          select: { status: true },
        })
        if (inv && inv.status !== 'PAID' && inv.status !== 'VOID') {
          await voidInvoice(inbound.invoiceId).catch(() => {})
        }
      }
      await prisma.shopifyInboundOrder.update({
        where: { id: inbound.id },
        data: { status: 'CANCELLED', lastError: 'Cancelled on Shopify' },
      })
    }
  }

  const order = await prisma.order.findFirst({
    where: { clientId: params.clientId, shopifyOrderId },
    select: { id: true, status: true, trackingNumber: true, internalNotes: true },
  })
  if (!order && !inbound) return { status: 'not_found' }
  if (!order) return { status: 'cancelled', inboundId: inbound?.id }
  if (order.trackingNumber || ['SHIPPED', 'COMPLETED', 'CANCELLED'].includes(order.status)) {
    return { status: 'noop', orderId: order.id, inboundId: inbound?.id }
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

  return { status: 'cancelled', orderId: order.id, inboundId: inbound?.id }
}
