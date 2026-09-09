/**
 * POST /api/webhooks/twilio/status — Twilio StatusCallback for outbound SMS.
 *
 * lib/sms/client passes this URL on every send; Twilio POSTs MessageSid +
 * MessageStatus (queued → sent → delivered | undelivered | failed) as the
 * message progresses. We advance the matching SmsMessage row (never backwards)
 * and, on error 21610 (recipient unsubscribed at the carrier), record the STOP
 * on SmsSubscriber so we stop attempting sends to that number.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { checkRateLimit, getRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'
import {
  formDataToParams,
  mapTwilioMessageStatus,
  shouldApplyStatusTransition,
  twilioWebhookCandidateUrls,
  validateTwilioSignature,
  TWILIO_ERROR_RECIPIENT_OPTED_OUT,
} from '@/lib/sms/twilio-webhook'
import { handleInboundKeyword } from '@/lib/sms/inbound'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN || ''
  if (!authToken) {
    logger.warn('[TWILIO WEBHOOK] status hit without TWILIO_AUTH_TOKEN configured')
    return NextResponse.json({ error: 'SMS not configured' }, { status: 503 })
  }

  const rl = await checkRateLimit(getRateLimitKey(request), RATE_LIMITS.webhook)
  if (rl.limited) return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 })

  let params: Record<string, string>
  try {
    params = formDataToParams(await request.formData())
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const valid = validateTwilioSignature({
    authToken,
    urls: twilioWebhookCandidateUrls(request.url, process.env.NEXT_PUBLIC_APP_URL || ''),
    params,
    signature: request.headers.get('x-twilio-signature'),
  })
  if (!valid) {
    logger.warn('[TWILIO WEBHOOK] status: invalid signature', { url: request.url })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  if (!prisma) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })

  const sid = params.MessageSid || params.SmsSid || ''
  const next = mapTwilioMessageStatus(params.MessageStatus || params.SmsStatus)
  if (!sid || !next) {
    return NextResponse.json({ received: true, ignored: 'missing sid or unknown status' })
  }
  const errorCode = params.ErrorCode ? String(params.ErrorCode) : null
  const errorMessage = params.ErrorMessage || null

  try {
    const row = await prisma.smsMessage.findUnique({
      where: { twilioSid: sid },
      select: { id: true, status: true, phone: true },
    })
    if (!row) {
      // Not one of ours (e.g. sent from the Console) — acknowledge quietly.
      return NextResponse.json({ received: true, ignored: 'unknown sid' })
    }

    if (shouldApplyStatusTransition(row.status, next)) {
      await prisma.smsMessage.update({
        where: { id: row.id },
        data: {
          status: next,
          errorCode: errorCode ?? undefined,
          errorMessage: errorMessage ?? undefined,
          ...(next === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
        },
      })
    }

    // Carrier says the recipient is unsubscribed → mirror as STOP so we stop trying.
    if (errorCode === TWILIO_ERROR_RECIPIENT_OPTED_OUT) {
      await handleInboundKeyword(row.phone, 'STOP', 'STOP (carrier 21610)').catch((e) =>
        logger.warn('[TWILIO WEBHOOK] 21610 mirror failed (non-blocking)', {
          error: e instanceof Error ? e.message : String(e),
        })
      )
    }

    logger.info('[TWILIO WEBHOOK] status applied', {
      sid,
      from: row.status,
      to: next,
      errorCode,
    })
    return NextResponse.json({ received: true })
  } catch (error) {
    logger.error(
      '[TWILIO WEBHOOK] status handling failed',
      { sid },
      error instanceof Error ? error : new Error(String(error))
    )
    // 200 so Twilio does not retry-storm; the row can be reconciled later.
    return NextResponse.json({ received: true, error: 'internal' })
  }
}
