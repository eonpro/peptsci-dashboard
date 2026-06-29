import { NextRequest } from 'next/server'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { logger } from '@/lib/logger'
import { markAllAsRead, markManyAsRead } from '@/lib/notifications/service'
import { resolveAdminUserId } from '@/lib/notifications/current-user'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Mark notifications read for the current admin.
 * Body: { all: true } to clear the whole inbox, or { ids: string[] }.
 */
export async function POST(request: NextRequest) {
  const { isAuthenticated, isAdmin, userId } = await requireAdmin()
  if (!isAuthenticated) return unauthorizedResponse()
  if (!isAdmin) return forbiddenResponse()

  const adminUserId = await resolveAdminUserId(userId)
  if (!adminUserId) return successResponse({ updated: 0 })

  const body = (await request.json().catch(() => ({}))) as { all?: boolean; ids?: string[] }

  try {
    let updated = 0
    if (body.all === true) {
      updated = await markAllAsRead(adminUserId)
    } else if (Array.isArray(body.ids) && body.ids.length > 0) {
      updated = await markManyAsRead(body.ids, adminUserId)
    } else {
      return errorResponse('Provide { all: true } or a non-empty { ids: [] }', 400, 'BAD_REQUEST')
    }
    return successResponse({ updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to mark notifications read'
    logger.error('[notifications] mark-read error', { message })
    return errorResponse(message)
  }
}
