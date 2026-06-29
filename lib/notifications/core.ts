/**
 * Pure, dependency-free notification helpers.
 *
 * Kept free of Prisma/Clerk imports so the pagination + dedup logic is
 * unit-testable without spinning up a database (the test runner uses
 * `node --import tsx --test` and pulling in @prisma/client/pg there is slow
 * and brittle — see Lessons in scratchpad).
 */

export const MAX_PAGE_SIZE = 100
export const DEFAULT_PAGE_SIZE = 20

/** Clamp incoming page/pageSize and derive the Prisma skip/take window. */
export function paginate(
  page: number | undefined,
  pageSize: number | undefined
): { page: number; pageSize: number; skip: number; take: number } {
  const safePage = Number.isFinite(page) && (page ?? 0) > 0 ? Math.floor(page as number) : 1
  const rawSize = Number.isFinite(pageSize) && (pageSize ?? 0) > 0 ? Math.floor(pageSize as number) : DEFAULT_PAGE_SIZE
  const safeSize = Math.min(rawSize, MAX_PAGE_SIZE)
  return { page: safePage, pageSize: safeSize, skip: (safePage - 1) * safeSize, take: safeSize }
}

/** Whether more rows exist beyond the current page. */
export function computeHasMore(page: number, pageSize: number, total: number): boolean {
  return page * pageSize < total
}

export interface PaginatedResult<T> {
  notifications: T[]
  total: number
  unreadCount: number
  page: number
  pageSize: number
  hasMore: boolean
}

export function buildPaginatedResult<T>(args: {
  notifications: T[]
  total: number
  unreadCount: number
  page: number
  pageSize: number
}): PaginatedResult<T> {
  const { notifications, total, unreadCount, page, pageSize } = args
  return {
    notifications,
    total,
    unreadCount,
    page,
    pageSize,
    hasMore: computeHasMore(page, pageSize, total),
  }
}

/**
 * A notification is a duplicate when an existing row for the same recipient
 * shares the same (sourceType, sourceId). Dedup only applies when BOTH source
 * fields are present — ad-hoc notifications without a source are never deduped.
 */
export function isDedupable(
  sourceType: string | null | undefined,
  sourceId: string | null | undefined
): boolean {
  return Boolean(sourceType) && Boolean(sourceId)
}

/**
 * Stable dedup source id for a date-windowed recurring alert (e.g. a daily
 * low-stock scan): combine the entity id with a yyyymmdd stamp so the same
 * entity notifies at most once per day.
 */
export function dailySourceId(entityId: string, date = new Date()): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${entityId}:${y}${m}${d}`
}
