/**
 * GET   /api/admin/messages/conversations/[id] — thread (marks inbound read
 *       unless ?read=0).
 * PATCH /api/admin/messages/conversations/[id] — status / assignee / clinic
 *       link / contact label.
 */

import { NextRequest } from 'next/server'
import { errorResponse, successResponse } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { writeAudit } from '@/lib/audit'
import { requireInboxStaff } from '@/lib/sms/inbox-auth'
import { getConversation, markConversationRead, updateConversation } from '@/lib/sms/inbox'
import { conversationPatchSchema } from '@/lib/sms/inbox-utils'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Ctx) {
  const guard = await requireInboxStaff()
  if (!guard.ok) return guard.response
  try {
    const { id } = await params
    const markRead = request.nextUrl.searchParams.get('read') !== '0'
    const existing = await getConversation(id)
    if (!existing) return errorResponse('Conversation not found', 404, 'NOT_FOUND')
    if (markRead && existing.unreadCount > 0) {
      await markConversationRead(id)
      const fresh = await getConversation(id)
      return successResponse({ conversation: fresh ?? existing })
    }
    return successResponse({ conversation: existing })
  } catch (error) {
    logger.error('[SMS INBOX] thread error', {}, error as Error)
    return errorResponse('Failed to load conversation')
  }
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const guard = await requireInboxStaff()
  if (!guard.ok) return guard.response
  try {
    const { id } = await params
    const parsed = conversationPatchSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return errorResponse('Invalid update', 400, 'VALIDATION_ERROR')

    const existing = await getConversation(id, 0)
    if (!existing) return errorResponse('Conversation not found', 404, 'NOT_FOUND')

    let conversation
    try {
      conversation = await updateConversation(id, parsed.data, guard.userId)
    } catch (error) {
      // Bad FK (unknown staff/clinic id) surfaces as a Prisma error.
      const message = error instanceof Error ? error.message : ''
      if (/foreign key|constraint/i.test(message)) {
        return errorResponse('Unknown staff member or clinic', 400, 'VALIDATION_ERROR')
      }
      throw error
    }

    void writeAudit({
      clerkUserId: guard.clerkUserId,
      entity: 'SmsConversation',
      entityId: id,
      action: 'sms_conversation_updated',
      metadata: {
        from: {
          status: existing.status,
          assignedToId: existing.assignedTo?.id ?? null,
          clientId: existing.client?.id ?? null,
        },
        patch: parsed.data,
      },
    })
    return successResponse({ conversation })
  } catch (error) {
    logger.error('[SMS INBOX] update error', {}, error as Error)
    return errorResponse('Failed to update conversation')
  }
}
