/**
 * Push PeptSci Order tracking to Shopify (fire-and-forget from warehouse routes).
 * Never throws to callers — logs + stamps connection.lastError on failure.
 */

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { decryptSecret } from './crypto'
import {
  createShopifyFulfillment,
  getOrderFulfillmentOrderIds,
  updateShopifyFulfillmentTracking,
  type ShopifyGraphqlClientConfig,
} from './client'
import { buildFulfillmentTrackingPayload } from './fulfillment-payload'
import { toOrderGid } from './ids'

export type SyncTrackingResult =
  | { ok: true; skipped?: string; fulfillmentId?: string }
  | { ok: false; error: string }

async function connectionConfig(connectionId: string): Promise<
  | (ShopifyGraphqlClientConfig & { connectionId: string })
  | null
> {
  if (!prisma) return null
  const conn = await prisma.shopifyConnection.findUnique({
    where: { id: connectionId },
    select: {
      id: true,
      shopDomain: true,
      accessToken: true,
      apiVersion: true,
      status: true,
    },
  })
  if (!conn || conn.status !== 'ACTIVE') return null
  return {
    connectionId: conn.id,
    shopDomain: conn.shopDomain,
    accessToken: decryptSecret(conn.accessToken),
    apiVersion: conn.apiVersion,
  }
}

/**
 * After FedEx label / manual disposition writes tracking on a SHOPIFY order,
 * create or update the Shopify fulfillment with tracking info.
 */
export async function syncShopifyOrderTracking(orderId: string): Promise<SyncTrackingResult> {
  if (!prisma) return { ok: false, error: 'Database not connected' }

  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        source: true,
        carrier: true,
        trackingNumber: true,
        trackingUrl: true,
        shopifyOrderId: true,
        shopifyFulfillmentOrderId: true,
        shopifyFulfillmentId: true,
        shopifyConnectionId: true,
      },
    })

    if (!order) return { ok: false, error: 'Order not found' }
    if (order.source !== 'SHOPIFY') return { ok: true, skipped: 'not_shopify' }
    if (!order.trackingNumber?.trim()) return { ok: true, skipped: 'no_tracking' }
    if (!order.shopifyConnectionId || !order.shopifyOrderId) {
      return { ok: false, error: 'Missing Shopify connection or order id' }
    }

    const config = await connectionConfig(order.shopifyConnectionId)
    if (!config) return { ok: false, error: 'Shopify connection inactive or missing' }

    const tracking = buildFulfillmentTrackingPayload({
      carrier: order.carrier,
      trackingNumber: order.trackingNumber,
      trackingUrl: order.trackingUrl,
    })

    // Already fulfilled on Shopify — update tracking only.
    if (order.shopifyFulfillmentId) {
      const updated = await updateShopifyFulfillmentTracking(config, {
        fulfillmentId: order.shopifyFulfillmentId,
        trackingCompany: tracking.company,
        trackingNumber: tracking.number,
        trackingUrl: tracking.url,
        notifyCustomer: true,
      })
      if (updated.userErrors.length) {
        const msg = updated.userErrors.map((e) => e.message).join('; ')
        await stampConnectionError(config.connectionId, msg)
        return { ok: false, error: msg }
      }
      await clearConnectionError(config.connectionId)
      return { ok: true, fulfillmentId: order.shopifyFulfillmentId }
    }

    let fulfillmentOrderId = order.shopifyFulfillmentOrderId
    if (!fulfillmentOrderId) {
      const ids = await getOrderFulfillmentOrderIds(config, toOrderGid(order.shopifyOrderId))
      fulfillmentOrderId = ids[0] ?? null
      if (fulfillmentOrderId) {
        await prisma.order.update({
          where: { id: order.id },
          data: { shopifyFulfillmentOrderId: fulfillmentOrderId },
        })
      }
    }

    if (!fulfillmentOrderId) {
      const msg = 'No open Shopify fulfillment order found'
      await stampConnectionError(config.connectionId, msg)
      return { ok: false, error: msg }
    }

    const created = await createShopifyFulfillment(config, {
      fulfillmentOrderId,
      trackingCompany: tracking.company,
      trackingNumber: tracking.number,
      trackingUrl: tracking.url,
      notifyCustomer: true,
      message: 'Fulfilled by PeptSci',
    })

    if (created.userErrors.length || !created.fulfillmentId) {
      const msg =
        created.userErrors.map((e) => e.message).join('; ') || 'fulfillmentCreate returned no id'
      await stampConnectionError(config.connectionId, msg)
      return { ok: false, error: msg }
    }

    await prisma.order.update({
      where: { id: order.id },
      data: {
        shopifyFulfillmentId: created.fulfillmentId,
        shopifyFulfillmentOrderId: fulfillmentOrderId,
      },
    })
    await clearConnectionError(config.connectionId)

    logger.info('[shopify] fulfillment synced', {
      orderId: order.id,
      fulfillmentId: created.fulfillmentId,
      trackingNumber: tracking.number,
    })

    return { ok: true, fulfillmentId: created.fulfillmentId }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.warn('[shopify] syncShopifyOrderTracking failed (non-blocking)', {
      orderId,
      error: message,
    })
    return { ok: false, error: message }
  }
}

/** Fire-and-forget wrapper for warehouse routes. */
export function pushShopifyTrackingAsync(orderId: string | null | undefined): void {
  if (!orderId) return
  void syncShopifyOrderTracking(orderId).catch((err) => {
    logger.warn('[shopify] async tracking push crashed', {
      orderId,
      error: err instanceof Error ? err.message : String(err),
    })
  })
}

async function stampConnectionError(connectionId: string, message: string) {
  if (!prisma) return
  await prisma.shopifyConnection
    .update({
      where: { id: connectionId },
      data: { lastError: message.slice(0, 500) },
    })
    .catch(() => {})
}

async function clearConnectionError(connectionId: string) {
  if (!prisma) return
  await prisma.shopifyConnection
    .update({
      where: { id: connectionId },
      data: { lastError: null },
    })
    .catch(() => {})
}
