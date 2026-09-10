/** GET /api/admin/messages/staff — assignable staff for the inbox. */

import { errorResponse, successResponse } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { requireInboxStaff } from '@/lib/sms/inbox-auth'
import { listAssignableStaff } from '@/lib/sms/inbox'

export const dynamic = 'force-dynamic'

export async function GET() {
  const guard = await requireInboxStaff()
  if (!guard.ok) return guard.response
  try {
    return successResponse({ staff: await listAssignableStaff(), me: guard.userId })
  } catch (error) {
    logger.error('[SMS INBOX] staff list error', {}, error as Error)
    return errorResponse('Failed to load staff')
  }
}
