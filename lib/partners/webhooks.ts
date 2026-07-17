/**
 * Partner outbound webhooks: HMAC-SHA256 signed, best-effort delivery.
 *
 * Events: `commission.accrued`, `commission.reversed`, `payout.recorded`.
 * Deliveries never block or fail the calling flow — failures just record the
 * last status on the subscription so the partner can see it in their portal.
 */

import { createHmac, randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export type PartnerWebhookEvent = 'commission.accrued' | 'commission.reversed' | 'payout.recorded'

export const PARTNER_WEBHOOK_EVENTS: PartnerWebhookEvent[] = [
  'commission.accrued',
  'commission.reversed',
  'payout.recorded',
]

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('hex')}`
}

/** `t=<unix>,v1=<hex hmac of "<t>.<body>">` — verifiable, replay-resistant. */
export function signWebhookPayload(secret: string, body: string, timestamp = Date.now()): string {
  const t = Math.floor(timestamp / 1000)
  const signature = createHmac('sha256', secret).update(`${t}.${body}`, 'utf8').digest('hex')
  return `t=${t},v1=${signature}`
}

const DELIVERY_TIMEOUT_MS = 5000

/**
 * Fan an event out to the org's active subscriptions that opted into it.
 * Fire-and-forget: callers should NOT await delivery outcomes; this function
 * itself never throws.
 */
export async function dispatchPartnerEvent(
  orgId: string,
  event: PartnerWebhookEvent,
  payload: Record<string, unknown>
): Promise<void> {
  if (!prisma) return
  try {
    const hooks = await prisma.partnerWebhook.findMany({
      where: { orgId, active: true },
    })
    const targets = hooks.filter((hook) => {
      const events = (hook.events as string[] | undefined) ?? []
      return events.length === 0 || events.includes(event)
    })
    if (targets.length === 0) return

    const body = JSON.stringify({
      event,
      createdAt: new Date().toISOString(),
      data: payload,
    })

    await Promise.allSettled(
      targets.map(async (hook) => {
        let status = 0
        try {
          const res = await fetch(hook.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-PeptSci-Event': event,
              'X-PeptSci-Signature': signWebhookPayload(hook.secret, body),
            },
            body,
            signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
            cache: 'no-store',
          })
          status = res.status
        } catch {
          status = 0 // network error / timeout
        }
        await prisma!.partnerWebhook
          .update({
            where: { id: hook.id },
            data: { lastDeliveryAt: new Date(), lastStatus: status },
          })
          .catch(() => {})
      })
    )
  } catch (err) {
    logger.warn('[PARTNER WEBHOOKS] dispatch failed (non-blocking)', {
      orgId,
      event,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
