import { NextRequest } from 'next/server'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { logger } from '@/lib/logger'
import { archiveNotification } from '@/lib/notifications/service'
import { resolveAdminUserId } from '@/lib/notifications/current-user'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { isAuthenticated, isAdmin, userId } = await requireAdmin()
  if (!isAuthenticated) return unauthorizedResponse()
  if (!isAdmin) return forbiddenResponse()

  const adminUserId = await resolveAdminUserId(userId)
  if (!adminUserId) return forbiddenResponse()

  const { id } = await params

  try {
    const ok = await archiveNotification(id, adminUserId)
    if (!ok) return errorResponse('Notification not found', 404, 'NOT_FOUND')
    return successResponse({ archived: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to archive notification'
    logger.error('[notifications] archive error', { message })
    return errorResponse(message)
  }
}
