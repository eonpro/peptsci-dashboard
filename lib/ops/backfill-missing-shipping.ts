/**
 * Pure helpers for the missing-shipping backfill ops route.
 */

import {
  computeShipping,
  FREE_SHIPPING_THRESHOLD,
  type ShipSpeed,
} from '@/lib/checkout-core'

export const EV_CLIENT_ID = 'cmsknhwra000004jlj41yi0l8'

/** Idempotency substring in invoice line descriptions / notes. */
export function shippingBackfillMarker(orderNumber: number): string {
  return `shipping — Order #${orderNumber}`
}

export function shippingBackfillLineDescription(
  orderNumber: number,
  shipSpeed: ShipSpeed,
  shopifyOrderName?: string | null
): string {
  const speedLabel = shipSpeed === 'OVERNIGHT' ? 'Next-day' : '2-day'
  const shopify = shopifyOrderName?.trim() ? ` / Shopify ${shopifyOrderName.trim()}` : ''
  return `${speedLabel} ${shippingBackfillMarker(orderNumber)}${shopify}`
}

export type ShippingBackfillOrderInput = {
  orderNumber: number
  subtotal: number
  shippingTotal: number
  paymentStatus: string
  status: string
  shipSpeed: string | null
}

/** CAPTURED, not cancelled/refunded, product subtotal under free-shipping threshold, $0 shipping. */
export function isShippingBackfillCandidate(order: ShippingBackfillOrderInput): boolean {
  if (order.paymentStatus !== 'CAPTURED') return false
  if (order.status === 'CANCELLED') return false
  if (order.shippingTotal > 0.005) return false
  if (order.subtotal <= 0) return false
  if (order.subtotal >= FREE_SHIPPING_THRESHOLD) return false
  return true
}

/** Policy amount with no client overrides (correct undercharges to global matrix). */
export function shippingBackfillAmount(
  subtotal: number,
  shipSpeed: string | null | undefined
): number {
  const speed: ShipSpeed = shipSpeed === 'OVERNIGHT' ? 'OVERNIGHT' : 'TWO_DAY'
  return computeShipping(subtotal, speed, null)
}

export function invoiceMentionsShippingBackfill(
  texts: Array<string | null | undefined>,
  orderNumber: number
): boolean {
  const marker = shippingBackfillMarker(orderNumber).toLowerCase()
  return texts.some((t) => (t ?? '').toLowerCase().includes(marker))
}
