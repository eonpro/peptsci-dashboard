/**
 * POST /api/webhooks/twilio/inbound — Twilio "A message comes in" webhook for
 * the PeptSci Alerts Messaging Service.
 *
 * Verifies X-Twilio-Signature against TWILIO_AUTH_TOKEN, stores EVERY inbound
 * text in the number's inbox thread (SmsConversation / SmsMessage INBOUND),
 * then mirrors campaign keywords into our records: STOP →
 * SmsSubscriber.optedOutAt + Client.smsOptIn = false; START/UNSTOP/YES →
 * re-consent (source KEYWORD). Free-form replies page staff (bell notification
 * + email to SUPPORT_EMAIL) so they can answer from /messages.
 *
 * Replies with empty TwiML because Twilio Advanced Opt-Out already sends the
 * compliant keyword auto-reply text; staff answers go out via the inbox.
 *
 * Configure in Twilio Console → Messaging → Services → PeptSci Alerts →
 * Integration → "Send a webhook" → https://peptsci.com/api/webhooks/twilio/inbound
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { checkRateLimit, getRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'
import {
  classifyInboundKeyword,
  formDataToParams,
  twilioWebhookCandidateUrls,
  validateTwilioSignature,
} from '@/lib/sms/twilio-webhook'
import { handleInboundKeyword } from '@/lib/sms/inbound'
import { recordInboundMessage } from '@/lib/sms/inbox-core'
import { notifyStaffOfInboundText } from '@/lib/sms/inbox-alerts'

export const dynamic = 'force-dynamic'

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'

function twiml(status = 200) {
  return new NextResponse(EMPTY_TWIML, { status, headers: { 'Content-Type': 'text/xml' } })
}

export async function POST(request: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN || ''
  if (!authToken) {
    logger.warn('[TWILIO WEBHOOK] inbound hit without TWILIO_AUTH_TOKEN configured')
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
    logger.warn('[TWILIO WEBHOOK] inbound: invalid signature', { url: request.url })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  if (!prisma) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })

  const from = params.From || ''
  const body = params.Body || ''
  const keyword = classifyInboundKeyword(body)
  const optOutType = (params.OptOutType || '').toUpperCase() // Twilio sets START/STOP/HELP when Advanced Opt-Out matched

  const effective =
    keyword ?? (optOutType === 'STOP' || optOutType === 'START' || optOutType === 'HELP' ? optOutType : null)

  // 1. Store the text in the CRM thread (idempotent on MessageSid).
  let stored: Awaited<ReturnType<typeof recordInboundMessage>> = null
  try {
    stored = await recordInboundMessage({
      from,
      body,
      twilioSid: params.MessageSid || null,
      keyword: effective,
    })
  } catch (error) {
    logger.error(
      '[TWILIO WEBHOOK] inbound store failed',
      { sid: params.MessageSid ?? null },
      error instanceof Error ? error : new Error(String(error))
    )
  }

  if (!effective) {
    // 2a. Free-form reply — page staff so someone answers from /messages.
    logger.info('[TWILIO WEBHOOK] inbound message stored', {
      from: from.slice(-4).padStart(from.length, '*'),
      sid: params.MessageSid ?? null,
      conversationId: stored?.conversationId ?? null,
      duplicate: stored?.duplicate ?? false,
    })
    if (stored && !stored.duplicate) {
      await notifyStaffOfInboundText({
        conversationId: stored.conversationId,
        messageId: stored.messageId,
        clientId: stored.clientId,
        phone: from,
        body,
        twilioSid: params.MessageSid || null,
      })
    }
    return twiml()
  }

  // 2b. Campaign keyword — mirror consent state.
  try {
    const result = await handleInboundKeyword(from, effective, body)
    logger.info('[TWILIO WEBHOOK] inbound keyword processed', {
      keyword: effective,
      sid: params.MessageSid ?? null,
      subscribersUpdated: result?.subscribersUpdated ?? 0,
      clientsUpdated: result?.clientsUpdated ?? 0,
    })
  } catch (error) {
    // Return 200 anyway: Twilio would otherwise retry and flag the webhook;
    // the carrier-level opt-out is already in effect.
    logger.error(
      '[TWILIO WEBHOOK] inbound keyword handling failed',
      { keyword: effective },
      error instanceof Error ? error : new Error(String(error))
    )
  }
  return twiml()
}
