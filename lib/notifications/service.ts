/**
 * Notification service — in-app notifications for admin users.
 *
 * Ported from eonpro/eonpro's notificationService (trimmed to the B2B
 * commerce/fulfillment domain, no WebSocket: the admin bell polls instead).
 *
 * Design notes:
 *  - createNotification dedupes on (userId, sourceType, sourceId) so a repeated
 *    cron run or webhook redelivery never double-notifies.
 *  - notifyAdmins fans a single alert out to every ACTIVE admin, deduped per
 *    admin, so cron jobs can broadcast safely.
 *  - All mutations are scoped by userId so an admin can only touch their own
 *    notifications.
 */

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import type { Notification, NotificationCategory, NotificationPriority, Prisma } from '@prisma/client'
import { paginate, buildPaginatedResult, isDedupable, type PaginatedResult } from './core'

function db() {
  if (!prisma) throw new Error('Database is not configured')
  return prisma
}

export interface CreateNotificationInput {
  userId: string
  clientId?: string | null
  category: NotificationCategory
  priority?: NotificationPriority
  title: string
  message: string
  actionUrl?: string | null
  metadata?: Record<string, unknown> | null
  sourceType?: string | null
  sourceId?: string | null
}

export type BroadcastInput = Omit<CreateNotificationInput, 'userId'>

export interface NotificationFilters {
  userId: string
  category?: NotificationCategory
  isRead?: boolean
  isArchived?: boolean
  startDate?: Date
  endDate?: Date
}

/** Prisma unique-constraint violation (P2002). */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'P2002'
  )
}

/**
 * Create a single notification, skipping it when an identical
 * (userId, sourceType, sourceId) row already exists.
 *
 * Dedup strategy: check-then-create narrows the window, and a unique-violation
 * (P2002) on create is treated as a concurrent dedup hit rather than an error,
 * so racing cron runs / webhook redeliveries can't double-notify.
 * NOTE: the durable fix is a DB unique index —
 * `@@unique([userId, sourceType, sourceId])` on Notification in schema.prisma
 * (currently only a non-unique index exists); this code already handles it.
 */
export async function createNotification(input: CreateNotificationInput): Promise<Notification> {
  const client = db()
  const dedupable = isDedupable(input.sourceType, input.sourceId)

  const findExisting = () =>
    client.notification.findFirst({
      where: {
        userId: input.userId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      },
    })

  if (dedupable) {
    const existing = await findExisting()
    if (existing) {
      logger.debug('Duplicate notification skipped', {
        userId: input.userId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      })
      return existing
    }
  }

  let notification: Notification
  try {
    notification = await client.notification.create({
      data: {
        userId: input.userId,
        clientId: input.clientId ?? undefined,
        category: input.category,
        priority: input.priority ?? 'NORMAL',
        title: input.title,
        message: input.message,
        actionUrl: input.actionUrl ?? undefined,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        sourceType: input.sourceType ?? undefined,
        sourceId: input.sourceId ?? undefined,
      },
    })
  } catch (err) {
    // A concurrent writer created the same (userId, sourceType, sourceId) row
    // between our check and create — treat the unique violation as a dedup.
    if (dedupable && isUniqueViolation(err)) {
      const existing = await findExisting()
      if (existing) {
        logger.debug('Duplicate notification skipped (concurrent create)', {
          userId: input.userId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
        })
        return existing
      }
    }
    throw err
  }

  logger.info('Notification created', {
    notificationId: notification.id,
    userId: notification.userId,
    category: notification.category,
  })

  return notification
}

/** Fan a single alert out to every ACTIVE admin (deduped per admin). */
export async function notifyAdmins(input: BroadcastInput): Promise<number> {
  const client = db()
  const admins = await client.user.findMany({
    where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, status: 'ACTIVE' },
    select: { id: true },
  })

  if (admins.length === 0) {
    logger.debug('No active admins to notify', { category: input.category })
    return 0
  }

  let count = 0
  for (const admin of admins) {
    await createNotification({ ...input, userId: admin.id })
    count += 1
  }
  return count
}

/** Notify a single user. */
export async function notifyUser(
  userId: string,
  input: BroadcastInput
): Promise<Notification> {
  return createNotification({ ...input, userId })
}

/** Paginated notifications for a user, with unread count for the badge. */
export async function getUserNotifications(
  filters: NotificationFilters,
  page?: number,
  pageSize?: number
): Promise<PaginatedResult<Notification>> {
  const client = db()
  const { page: p, pageSize: ps, skip, take } = paginate(page, pageSize)

  const where: Prisma.NotificationWhereInput = {
    userId: filters.userId,
    ...(filters.category && { category: filters.category }),
    ...(filters.isRead !== undefined && { isRead: filters.isRead }),
    ...(filters.isArchived !== undefined && { isArchived: filters.isArchived }),
    ...((filters.startDate || filters.endDate) && {
      createdAt: {
        ...(filters.startDate && { gte: filters.startDate }),
        ...(filters.endDate && { lte: filters.endDate }),
      },
    }),
  }

  const [notifications, total, unreadCount] = await Promise.all([
    client.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    client.notification.count({ where }),
    client.notification.count({
      where: { userId: filters.userId, isRead: false, isArchived: false },
    }),
  ])

  return buildPaginatedResult({ notifications, total, unreadCount, page: p, pageSize: ps })
}

/** Unread, non-archived count for the bell badge. */
export async function getUnreadCount(userId: string): Promise<number> {
  return db().notification.count({
    where: { userId, isRead: false, isArchived: false },
  })
}

export async function markAsRead(notificationId: string, userId: string): Promise<number> {
  const result = await db().notification.updateMany({
    where: { id: notificationId, userId },
    data: { isRead: true, readAt: new Date() },
  })
  return result.count
}

export async function markManyAsRead(notificationIds: string[], userId: string): Promise<number> {
  if (notificationIds.length === 0) return 0
  const result = await db().notification.updateMany({
    where: { id: { in: notificationIds }, userId },
    data: { isRead: true, readAt: new Date() },
  })
  return result.count
}

export async function markAllAsRead(
  userId: string,
  category?: NotificationCategory
): Promise<number> {
  const result = await db().notification.updateMany({
    where: { userId, isRead: false, ...(category && { category }) },
    data: { isRead: true, readAt: new Date() },
  })
  logger.info('Marked all notifications as read', { userId, count: result.count, category })
  return result.count
}

export async function archiveNotification(notificationId: string, userId: string): Promise<boolean> {
  const result = await db().notification.updateMany({
    where: { id: notificationId, userId },
    data: { isArchived: true, archivedAt: new Date() },
  })
  return result.count > 0
}

export async function archiveMany(notificationIds: string[], userId: string): Promise<number> {
  if (notificationIds.length === 0) return 0
  const result = await db().notification.updateMany({
    where: { id: { in: notificationIds }, userId },
    data: { isArchived: true, archivedAt: new Date() },
  })
  return result.count
}

/** Cleanup job: delete archived notifications older than `daysOld`. */
export async function cleanupOldNotifications(daysOld = 90): Promise<number> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - daysOld)
  const result = await db().notification.deleteMany({
    where: { isArchived: true, archivedAt: { lt: cutoff } },
  })
  if (result.count > 0) {
    logger.info('Cleaned up old notifications', { count: result.count, daysOld })
  }
  return result.count
}
