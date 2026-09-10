/**
 * Staff alerting for inbound texts: bell notification to all active staff
 * (deduped on the Twilio MessageSid) and an email to the support inbox with a
 * deep link into /messages. Never throws — the webhook must return 200.
 *
 * @module lib/sms/inbox-alerts
 */

import { prisma } from '../prisma'
import { logger } from '../logger'
import { notifyAdmins } from '../notifications/service'
import { sendEmail } from '../email/client'
import { formatPhoneDisplay, messagePreview } from './inbox-utils'
import { toE164US } from './phone'

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@peptsci.com'
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface InboundTextAlertInput {
  conversationId: string
  messageId: string
  clientId: string | null
  phone: string
  body: string
  twilioSid: string | null
}

export async function notifyStaffOfInboundText(input: InboundTextAlertInput): Promise<void> {
  const phone = toE164US(input.phone) ?? input.phone
  const phoneDisplay = formatPhoneDisplay(phone)
  const actionUrl = `/messages?c=${encodeURIComponent(input.conversationId)}`

  let practice: string | null = null
  if (input.clientId && prisma) {
    try {
      const c = await prisma.client.findUnique({
        where: { id: input.clientId },
        select: { organizationName: true },
      })
      practice = c?.organizationName ?? null
    } catch {
      practice = null
    }
  }
  const who = practice ? `${practice} (${phoneDisplay})` : phoneDisplay
  const preview = messagePreview(input.body, 160)

  try {
    await notifyAdmins({
      category: 'CLIENT',
      priority: 'HIGH',
      title: `New text from ${who}`,
      message: preview,
      actionUrl,
      clientId: input.clientId,
      sourceType: 'sms_inbound',
      sourceId: input.twilioSid ?? input.messageId,
      metadata: { conversationId: input.conversationId, messageId: input.messageId },
    })
  } catch (error) {
    logger.warn('[SMS INBOX] bell notification failed', {
      error: error instanceof Error ? error.message : String(error),
    })
  }

  try {
    const link = APP_URL ? `${APP_URL}${actionUrl}` : actionUrl
    await sendEmail({
      to: SUPPORT_EMAIL,
      subject: `[PeptSci Texts] ${who} replied`,
      text: `${who} sent a text to PeptSci Alerts:\n\n"${input.body.trim()}"\n\nReply from the inbox: ${link}\n`,
      html: `<p><strong>${escapeHtml(who)}</strong> sent a text to PeptSci Alerts:</p>
<blockquote style="margin:12px 0;padding:10px 14px;border-left:3px solid #2d46e8;background:#f5f6fb;white-space:pre-wrap;">${escapeHtml(input.body.trim())}</blockquote>
<p><a href="${escapeHtml(link)}">Open the conversation in the inbox</a></p>`,
    })
  } catch (error) {
    logger.warn('[SMS INBOX] alert email failed', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
