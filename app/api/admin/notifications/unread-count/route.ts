import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { logger } from '@/lib/logger'
import { getUnreadCount } from '@/lib/notifications/service'
import { resolveAdminUserId } from '@/lib/notifications/current-user'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const { isAuthenticated, isAdmin, userId } = await requireAdmin()
  if (!isAuthenticated) return unauthorizedResponse()
  if (!isAdmin) return forbiddenResponse()

  const adminUserId = await resolveAdminUserId(userId)
  if (!adminUserId) return successResponse({ count: 0 })

  try {
    const count = await getUnreadCount(adminUserId)
    return successResponse({ count })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load unread count'
    logger.error('[notifications] unread-count error', { message })
    return errorResponse(message)
  }
}
