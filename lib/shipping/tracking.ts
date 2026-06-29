/**
 * Public (unauthenticated) shipment tracking lookup.
 *
 * Backs the customer-facing /tracking/[trackingNumber] page. Returns ONLY
 * non-sensitive shipment fields — never client names, patient details, or
 * addresses — so the page is safe to expose without a login.
 *
 * Server-only.
 */

import { prisma } from '@/lib/prisma'
import { fedexTrackingUrl } from '@/lib/fedex'

export interface PublicTrackingInfo {
  orderNumber: number
  carrier: string
  trackingNumber: string
  trackingUrl: string
  /** Stored shipping status (e.g. IN_TRANSIT, DELIVERED) or null if unknown. */
  shippingStatus: string | null
  shippedAt: Date | null
}

/**
 * Look up a shipment by tracking number. Returns null when the number is
 * unknown (or the DB is unavailable) so the page can render a "not found"
 * state without leaking whether a tracking number exists.
 */
export async function getPublicTracking(
  trackingNumber: string
): Promise<PublicTrackingInfo | null> {
  const normalized = trackingNumber.trim()
  if (!normalized || !prisma) return null

  const order = await prisma.order.findFirst({
    where: { trackingNumber: normalized },
    select: {
      orderNumber: true,
      carrier: true,
      trackingNumber: true,
      trackingUrl: true,
      shippingStatus: true,
      shippedAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!order || !order.trackingNumber) return null

  return {
    orderNumber: order.orderNumber,
    carrier: order.carrier ?? 'FedEx',
    trackingNumber: order.trackingNumber,
    trackingUrl: order.trackingUrl ?? fedexTrackingUrl(order.trackingNumber),
    shippingStatus: order.shippingStatus,
    shippedAt: order.shippedAt,
  }
}
