/**
 * Browser-side calls into the order fulfillment endpoint.
 *
 * Kept out of the wizard component so the fulfillment page can record a step
 * from a modal callback without pulling the wizard's chunk into its bundle.
 *
 * @module lib/fulfillment/api-client
 */

import { apiError } from '../api-error'
import {
  labelShortfallFromPickList,
  parseLabelShortfall,
  type LabelShortfallEntry,
} from './label-shortfall'
import type { FulfillmentStepName } from './wizard-core'

/** Screens whose completion advances the cursor (Review goes via `complete`). */
export type AdvanceableStep = Exclude<FulfillmentStepName, 'REVIEW' | 'COMPLETE'>

/** Mirrors the discriminated union accepted by the fulfillment route. */
export type FulfillmentRequest =
  | { action: 'start' }
  | { action: 'step'; step: AdvanceableStep; manual?: boolean; skipped?: boolean }
  | { action: 'complete' }

export async function postFulfillment(orderId: string, body: FulfillmentRequest): Promise<void> {
  const res = await fetch(`/api/admin/orders/${orderId}/fulfillment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await apiError(res, 'Failed to update fulfillment')
}

/**
 * Which order lines have no batch behind them, and so will print no vial label.
 * Read from the pick list so the wizard can warn on its first screen, before the
 * operator prints. Advisory only — a failure here must never block fulfillment,
 * so it resolves to "nothing short" rather than throwing.
 */
export async function fetchLabelShortfall(orderId: string): Promise<LabelShortfallEntry[]> {
  try {
    const res = await fetch(`/api/admin/orders/${orderId}/pick-list`)
    if (!res.ok) return []
    const payload = (await res.json()) as { pickList?: { lines?: unknown } }
    return labelShortfallFromPickList(
      payload.pickList as Parameters<typeof labelShortfallFromPickList>[0]
    )
  } catch {
    return []
  }
}

/**
 * Download the order's vial label sheet and report anything it could not label.
 *
 * Fetched as a blob rather than opened by URL so the `X-Label-Shortfall` header
 * is readable — opening the URL in a tab discards the response headers, which is
 * how short sheets used to print unnoticed.
 */
export async function downloadLabelSheet(
  orderId: string,
  orderNumber: number
): Promise<LabelShortfallEntry[]> {
  const res = await fetch(`/api/admin/orders/${orderId}/labels/pdf`)
  if (!res.ok) throw await apiError(res, 'Failed to generate vial labels')
  const shortfall = parseLabelShortfall(res.headers.get('X-Label-Shortfall'))
  const url = URL.createObjectURL(await res.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = `order-${orderNumber}-labels.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  return shortfall
}

/**
 * Record the ship screen as done. Called from the FedEx label and manual
 * tracking modals once they succeed, which is what moves the wizard on to its
 * final review screen.
 */
export function recordShipStep(orderId: string): Promise<void> {
  return postFulfillment(orderId, { action: 'step', step: 'SHIP' })
}
