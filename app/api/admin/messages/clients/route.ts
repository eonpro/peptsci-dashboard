/** GET /api/admin/messages/clients?q= — clinic picker for linking a thread. */

import { NextRequest } from 'next/server'
import { errorResponse, successResponse } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { requireInboxStaff } from '@/lib/sms/inbox-auth'
import { searchClientsForLink } from '@/lib/sms/inbox'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const guard = await requireInboxStaff()
  if (!guard.ok) return guard.response
  try {
    const q = (request.nextUrl.searchParams.get('q') || '').slice(0, 80)
    return successResponse({ clients: await searchClientsForLink(q) })
  } catch (error) {
    logger.error('[SMS INBOX] client search error', {}, error as Error)
    return errorResponse('Failed to search clinics')
  }
}
