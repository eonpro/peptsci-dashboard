import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { requireAuth, errorResponse, successResponse } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, getRateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limit'
import { resolveShopClientId } from '@/lib/shop-actor'
import { parseSmsSubscribeInput, SMS_PROGRAM_NAME } from '@/lib/sms/program'
import { enrollSmsSubscriber } from '@/lib/sms/subscribe'

export const dynamic = 'force-dynamic'

/**
 * POST /api/sms/subscribe — public PeptSci Alerts opt-in (the /sms page).
 *
 * Body: { phone: string, consent: true, email?: string }
 * Records TCPA proof of consent (verbatim checkbox text + timestamp + IP/UA),
 * links the record to the signed-in client when there is one, and sends the
 * one-time opt-in confirmation SMS. Rate-limited per IP; no auth required.
 */
export async function POST(request: NextRequest) {
  try {
    const rl = await checkRateLimit(getRateLimitKey(request), RATE_LIMITS.auth)
    if (rl.limited) {
      return NextResponse.json(
        {
          error: 'Too Many Requests',
          message: 'Too many attempts. Please wait a minute and try again.',
          code: 'RATE_LIMITED',
        },
        { status: 429, headers: getRateLimitHeaders(rl.remaining, RATE_LIMITS.auth, rl.retryAfter) }
      )
    }
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const parsed = parseSmsSubscribeInput(await request.json().catch(() => ({})))
    if (!parsed.ok) return errorResponse(parsed.error, 400, 'VALIDATION_ERROR')

    // Opportunistic: if a clinic user is signed in, tie the consent to their
    // account so order/shipping texts unlock immediately. Never required.
    let clientId: string | null = null
    try {
      const { userId, isAuthenticated } = await requireAuth()
      if (isAuthenticated && userId) clientId = await resolveShopClientId(userId)
    } catch {
      clientId = null
    }

    const ipAddress = getRateLimitKey(request).replace(/^ip:/, '')
    const result = await enrollSmsSubscriber({
      ...parsed.data,
      source: 'WEB_SMS_PAGE',
      clientId,
      ipAddress: ipAddress.startsWith('user:') ? null : ipAddress,
      userAgent: request.headers.get('user-agent'),
    })

    return successResponse(
      {
        success: true,
        program: SMS_PROGRAM_NAME,
        phone: result.phone,
        confirmationSent: result.confirmationSent,
      },
      result.created ? 201 : 200
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Subscription failed'
    logger.error('[SMS SUBSCRIBE] error', { message })
    return errorResponse('Could not save your SMS preference. Please try again.')
  }
}
