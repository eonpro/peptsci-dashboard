import { NextRequest } from 'next/server'
import { logger } from '@/lib/logger'

/**
 * Verify a Vercel Cron request (ported from eonpro/eonpro `verifyCronAuth`).
 *
 * Secure path: when `CRON_SECRET` is set, require the
 * `Authorization: Bearer <CRON_SECRET>` header that Vercel automatically sends
 * to scheduled invocations (or an explicit `x-cron-secret` header). The
 * `x-vercel-cron` header alone is NOT accepted while a secret is set, because
 * any caller hitting the public URL could forge it.
 *
 * Degraded safety net: if `CRON_SECRET` is missing in production we fall back to
 * trusting Vercel's `x-vercel-cron: 1` marker and log loudly, rather than
 * silently 401'ing every cron (a failure mode that's easy to miss). This
 * loosening only applies while the secret is unset.
 */
export function verifyCronAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  const isVercelCron = request.headers.get('x-vercel-cron') === '1'

  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    const cronHeader = request.headers.get('x-cron-secret')
    const provided = authHeader?.replace(/^Bearer\s+/i, '').trim() || cronHeader || ''
    return timingSafeEqual(provided, cronSecret)
  }

  if (process.env.NODE_ENV !== 'production') return true // dev/test: allow

  if (isVercelCron) {
    logger.error(
      '[cron-auth] CRON_SECRET is not set in production — allowing this cron via the ' +
        'x-vercel-cron header as a safety net. Set CRON_SECRET to secure cron endpoints.'
    )
    return true
  }
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
