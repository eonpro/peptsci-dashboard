import { NextRequest } from 'next/server'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { logger } from '@/lib/logger'
import { getUserNotifications, type NotificationFilters } from '@/lib/notifications/service'
import { resolveAdminUserId } from '@/lib/notifications/current-user'
import type { NotificationCategory } from '@prisma/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const CATEGORIES: NotificationCategory[] = ['ORDER', 'PAYMENT', 'SHIPMENT', 'INVENTORY', 'CLIENT', 'SYSTEM']

export async function GET(request: NextRequest) {
  const { isAuthenticated, isAdmin, userId } = await requireAdmin()
  if (!isAuthenticated) return unauthorizedResponse()
  if (!isAdmin) return forbiddenResponse()

  const adminUserId = await resolveAdminUserId(userId)
  if (!adminUserId) {
    // No internal user mapped (e.g. dev with no seeded admin) — return empty.
    return successResponse({ notifications: [], total: 0, unreadCount: 0, page: 1, pageSize: 20, hasMore: false })
  }

  try {
    const sp = request.nextUrl.searchParams
    const page = Number(sp.get('page') ?? '1')
    const pageSize = Number(sp.get('pageSize') ?? '20')
    const categoryParam = sp.get('category')
    const category = categoryParam && CATEGORIES.includes(categoryParam as NotificationCategory)
      ? (categoryParam as NotificationCategory)
      : undefined
    const isReadParam = sp.get('isRead')
    const isArchivedParam = sp.get('isArchived')

    const filters: NotificationFilters = {
      userId: adminUserId,
      ...(category && { category }),
      ...(isReadParam !== null && { isRead: isReadParam === 'true' }),
      // Default to the active (non-archived) inbox unless explicitly overridden.
      isArchived: isArchivedParam === null ? false : isArchivedParam === 'true',
    }

    const result = await getUserNotifications(filters, page, pageSize)
    return successResponse(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load notifications'
    logger.error('[notifications] list error', { message })
    return errorResponse(message)
  }
}
