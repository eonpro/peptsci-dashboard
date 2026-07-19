import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { getUnreadCount } from '@/lib/notifications/service'
import { resolveShopActor } from '@/lib/shop-actor'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** GET — unread badge count for the clinic user's bell. */
export async function GET() {
  const { isAuthenticated, userId } = await requireAuth()
  if (!isAuthenticated || !userId) return unauthorizedResponse()

  const actor = await resolveShopActor(userId)
  if (!actor) return successResponse({ count: 0 })

  try {
    const count = await getUnreadCount(actor.userId)
    return successResponse({ count })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load unread count'
    logger.error('[shop notifications] unread-count error', { message })
    return errorResponse(message)
  }
}
