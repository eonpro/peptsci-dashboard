/**
 * Browser-side calls into the order fulfillment endpoint.
 *
 * Kept out of the wizard component so the fulfillment page can record a step
 * from a modal callback without pulling the wizard's chunk into its bundle.
 *
 * @module lib/fulfillment/api-client
 */

import { apiError } from '../api-error'
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
 * Record the ship screen as done. Called from the FedEx label and manual
 * tracking modals once they succeed, which is what moves the wizard on to its
 * final review screen.
 */
export function recordShipStep(orderId: string): Promise<void> {
  return postFulfillment(orderId, { action: 'step', step: 'SHIP' })
}
