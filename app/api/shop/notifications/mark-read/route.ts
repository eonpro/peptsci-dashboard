import { NextRequest } from 'next/server'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { markAllAsRead, markManyAsRead } from '@/lib/notifications/service'
import { resolveShopActor } from '@/lib/shop-actor'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Mark notifications read for the current clinic user.
 * Body: { all: true } to clear the whole inbox, or { ids: string[] }.
 * The service scopes every mutation by userId, so ids belonging to another
 * user are silently ignored.
 */
export async function POST(request: NextRequest) {
  const { isAuthenticated, userId } = await requireAuth()
  if (!isAuthenticated || !userId) return unauthorizedResponse()

  const actor = await resolveShopActor(userId)
  if (!actor) return successResponse({ updated: 0 })

  const body = (await request.json().catch(() => ({}))) as { all?: boolean; ids?: string[] }

  try {
    let updated = 0
    if (body.all === true) {
      updated = await markAllAsRead(actor.userId)
    } else if (Array.isArray(body.ids) && body.ids.length > 0) {
      updated = await markManyAsRead(body.ids, actor.userId)
    } else {
      return errorResponse('Provide { all: true } or a non-empty { ids: [] }', 400, 'BAD_REQUEST')
    }
    return successResponse({ updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to mark notifications read'
    logger.error('[shop notifications] mark-read error', { message })
    return errorResponse(message)
  }
}
