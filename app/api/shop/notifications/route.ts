import { NextRequest } from 'next/server'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { getUserNotifications, type NotificationFilters } from '@/lib/notifications/service'
import { resolveShopActor } from '@/lib/shop-actor'
import type { NotificationCategory } from '@prisma/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const CATEGORIES: NotificationCategory[] = ['ORDER', 'PAYMENT', 'SHIPMENT', 'INVENTORY', 'CLIENT', 'SYSTEM']

/** GET — the clinic user's in-app notifications (service is userId-scoped). */
export async function GET(request: NextRequest) {
  const { isAuthenticated, userId } = await requireAuth()
  if (!isAuthenticated || !userId) return unauthorizedResponse()

  const actor = await resolveShopActor(userId)
  if (!actor) {
    // No client-linked user (e.g. fresh signup mid-onboarding) — empty inbox.
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
      userId: actor.userId,
      ...(category && { category }),
      ...(isReadParam !== null && { isRead: isReadParam === 'true' }),
      isArchived: isArchivedParam === null ? false : isArchivedParam === 'true',
    }

    const result = await getUserNotifications(filters, page, pageSize)
    return successResponse(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load notifications'
    logger.error('[shop notifications] list error', { message })
    return errorResponse(message)
  }
}
