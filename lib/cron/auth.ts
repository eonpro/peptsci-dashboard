import { NextRequest } from 'next/server'
import { logger } from '@/lib/logger'

/**
 * Verify a Vercel Cron request (ported from eonpro/eonpro `verifyCronAuth`).
 *
 * Secure path: when `CRON_SECRET` is set, require the
 * `Authorization: Bearer <CRON_SECRET>` header that Vercel automatically sends
 * to scheduled invocations (or an explicit `x-cron-secret` header). The
 * `x-vercel-cron` header alone is NEVER accepted, because any caller hitting the
 * public URL could forge it.
 *
 * Fail closed: if `CRON_SECRET` is missing in production we DENY (and log
 * loudly). We do NOT fall back to trusting the client-controllable
 * `x-vercel-cron: 1` marker — that let anyone trigger customer emails/SMS,
 * FedEx polling, and invoice status changes. Only local dev/test is allowed
 * without a secret.
 */
export function verifyCronAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    const cronHeader = request.headers.get('x-cron-secret')
    const provided = authHeader?.replace(/^Bearer\s+/i, '').trim() || cronHeader || ''
    return timingSafeEqual(provided, cronSecret)
  }

  if (process.env.NODE_ENV !== 'production') return true // dev/test: allow

  logger.error(
    '[cron-auth] CRON_SECRET is not set in production — denying cron request. ' +
      'Set CRON_SECRET to enable scheduled jobs.'
  )
  return false
}

/** Length-independent constant-time string comparison. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}
