/**
 * GET /api/admin/messages/conversations — SMS inbox list.
 *   ?status=OPEN|CLOSED|ALL (default OPEN) &unread=1 &mine=1 &q=<text|digits>
 *   &clientId=<id> &limit=<n>
 */

import { NextRequest } from 'next/server'
import { errorResponse, successResponse } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { requireInboxStaff } from '@/lib/sms/inbox-auth'
import { listConversations } from '@/lib/sms/inbox'
import { conversationListQuerySchema } from '@/lib/sms/inbox-utils'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const guard = await requireInboxStaff()
  if (!guard.ok) return guard.response
  try {
    const parsed = conversationListQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams.entries())
    )
    if (!parsed.success) return errorResponse('Invalid query', 400, 'VALIDATION_ERROR')
    const data = await listConversations(parsed.data, guard.userId)
    return successResponse(data)
  } catch (error) {
    logger.error('[SMS INBOX] list error', {}, error as Error)
    return errorResponse('Failed to load conversations')
  }
}
