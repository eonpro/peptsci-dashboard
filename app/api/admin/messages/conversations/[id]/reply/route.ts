/**
 * POST /api/admin/messages/conversations/[id]/reply — send a staff text on
 * the thread via the PeptSci Alerts Messaging Service. { body }
 */

import { NextRequest } from 'next/server'
import { errorResponse, successResponse } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { writeAudit } from '@/lib/audit'
import { checkRateLimit } from '@/lib/rate-limit'
import { requireInboxStaff } from '@/lib/sms/inbox-auth'
import { sendStaffReply } from '@/lib/sms/inbox'
import { conversationReplySchema } from '@/lib/sms/inbox-utils'

export const dynamic = 'force-dynamic'

/** 30 texts / minute / staff member — well under the campaign throughput. */
const REPLY_RATE_LIMIT = { interval: 60_000, maxRequests: 30 }

const STATUS_FOR_CODE = {
  NOT_FOUND: 404,
  OPTED_OUT: 409,
  SMS_DISABLED: 503,
  SEND_FAILED: 502,
} as const

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireInboxStaff()
  if (!guard.ok) return guard.response
  try {
    // Per-staff throttle: a runaway client can't burn the campaign's throughput.
    const rl = await checkRateLimit(`sms-reply:${guard.clerkUserId ?? 'anon'}`, REPLY_RATE_LIMIT)
    if (rl.limited) return errorResponse('Too many messages — slow down.', 429, 'RATE_LIMITED')

    const { id } = await params
    const parsed = conversationReplySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0]?.message || 'Invalid message', 400, 'VALIDATION_ERROR')
    }

    const result = await sendStaffReply({
      conversationId: id,
      body: parsed.data.body,
      senderUserId: guard.userId,
    })
    if (!result.ok) return errorResponse(result.error, STATUS_FOR_CODE[result.code], result.code)

    void writeAudit({
      clerkUserId: guard.clerkUserId,
      entity: 'SmsConversation',
      entityId: id,
      action: 'sms_reply_sent',
      metadata: { messageId: result.message.id, chars: parsed.data.body.length },
    })
    return successResponse({ message: result.message, conversation: result.conversation }, 201)
  } catch (error) {
    logger.error('[SMS INBOX] reply error', {}, error as Error)
    return errorResponse('Failed to send message')
  }
}
