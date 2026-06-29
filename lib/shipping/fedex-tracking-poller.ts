/**
 * FedEx tracking poller.
 *
 * Selects non-terminal orders that carry a FedEx tracking number, polls the
 * FedEx Track API for each, writes the normalized status back onto the Order,
 * and — on the first transition to DELIVERED — notifies admins (deduped per
 * order). Ported in spirit from eonpro/eonpro's pollActiveFedExShipments,
 * mapped onto PeptSci's Order model.
 *
 * Server-only. Degrades to a no-op (`skipped: true`) when FedEx is unconfigured.
 */

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { getCredentials, trackShipment, fedexTrackingUrl } from '@/lib/fedex'
import { notifyAdmins } from '@/lib/notifications/service'
import { mapFedExStatusToShipping } from '@/lib/shipping/fedex-status'
import { sendOrderDeliveredEmail, sendOrderExceptionEmail } from '@/lib/email'

export interface PollResult {
  skipped?: boolean
  reason?: string
  scanned: number
  updated: number
  delivered: number
  errors: number
}

const DEFAULT_LIMIT = 200

export async function pollActiveFedExShipments(limit = DEFAULT_LIMIT): Promise<PollResult> {
  if (!prisma) return { skipped: true, reason: 'db_unconfigured', scanned: 0, updated: 0, delivered: 0, errors: 0 }

  const creds = getCredentials()
  if (!creds) {
    return { skipped: true, reason: 'fedex_unconfigured', scanned: 0, updated: 0, delivered: 0, errors: 0 }
  }

  const orders = await prisma.order.findMany({
    where: {
      trackingNumber: { not: null },
      OR: [{ shippingStatus: null }, { shippingStatus: { notIn: ['DELIVERED', 'CANCELLED'] } }],
    },
    select: {
      id: true,
      orderNumber: true,
      trackingNumber: true,
      shippingStatus: true,
      carrier: true,
      client: {
        select: { organizationName: true, contactName: true, contactEmail: true },
      },
    },
    orderBy: { updatedAt: 'asc' },
    take: limit,
  })

  let updated = 0
  let delivered = 0
  let errors = 0

  for (const order of orders) {
    if (!order.trackingNumber) continue
    try {
      const result = await trackShipment(creds, order.trackingNumber)
      const mapped = mapFedExStatusToShipping(result.statusCode)
      if (!mapped || mapped === order.shippingStatus) continue

      await prisma.order.update({
        where: { id: order.id },
        data: { shippingStatus: mapped },
      })
      updated += 1

      const trackingUrl = fedexTrackingUrl(order.trackingNumber)
      const carrier = order.carrier ?? 'FedEx'
      const org = order.client?.organizationName ?? 'a client'
      const customerEmail = order.client?.contactEmail ?? null
      const customerName = order.client?.contactName || order.client?.organizationName || null

      if (mapped === 'DELIVERED') {
        delivered += 1
        await notifyAdmins({
          category: 'SHIPMENT',
          priority: 'NORMAL',
          title: `Order #${order.orderNumber} delivered`,
          message: `FedEx reports tracking ${order.trackingNumber} for ${org} was delivered.`,
          actionUrl: `/fulfillment`,
          metadata: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            trackingNumber: order.trackingNumber,
            trackingUrl,
            deliveredAt: result.deliveredAt,
          },
          sourceType: 'cron:fedex-tracking',
          sourceId: `${order.id}:DELIVERED`,
        })
        if (customerEmail) {
          void sendOrderDeliveredEmail({
            to: customerEmail,
            customerName,
            orderNumber: order.orderNumber,
            trackingNumber: order.trackingNumber,
            carrier,
          }).catch((e) =>
            logger.warn('[fedex-poller] delivered email failed (non-blocking)', {
              orderId: order.id,
              error: e instanceof Error ? e.message : String(e),
            })
          )
        }
      } else if (mapped === 'EXCEPTION') {
        await notifyAdmins({
          category: 'SHIPMENT',
          priority: 'HIGH',
          title: `Delivery exception on order #${order.orderNumber}`,
          message: `FedEx reported a delivery exception for tracking ${order.trackingNumber} (${org}).`,
          actionUrl: `/fulfillment`,
          metadata: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            trackingNumber: order.trackingNumber,
            trackingUrl,
            statusDescription: result.statusDescription,
          },
          sourceType: 'cron:fedex-tracking',
          sourceId: `${order.id}:EXCEPTION`,
        })
        if (customerEmail) {
          void sendOrderExceptionEmail({
            to: customerEmail,
            customerName,
            orderNumber: order.orderNumber,
            trackingNumber: order.trackingNumber,
            carrier,
          }).catch((e) =>
            logger.warn('[fedex-poller] exception email failed (non-blocking)', {
              orderId: order.id,
              error: e instanceof Error ? e.message : String(e),
            })
          )
        }
      }
    } catch (err) {
      errors += 1
      logger.error('[fedex-poller] tracking failed', {
        orderId: order.id,
        trackingNumber: order.trackingNumber,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  logger.info('[fedex-poller] complete', { scanned: orders.length, updated, delivered, errors })
  return { scanned: orders.length, updated, delivered, errors }
}
