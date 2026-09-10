/** GET /api/admin/messages/unread-count — threads with unread inbound texts. */

import { errorResponse, successResponse } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { requireInboxStaff } from '@/lib/sms/inbox-auth'
import { unreadConversationCount } from '@/lib/sms/inbox'

export const dynamic = 'force-dynamic'

export async function GET() {
  const guard = await requireInboxStaff()
  if (!guard.ok) return guard.response
  try {
    return successResponse({ unread: await unreadConversationCount() })
  } catch (error) {
    logger.error('[SMS INBOX] unread-count error', {}, error as Error)
    return errorResponse('Failed to load unread count')
  }
}
