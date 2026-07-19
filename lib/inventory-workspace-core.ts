/**
 * Pure, DB-free helpers for the Inventory workspace APIs: query-param parsing
 * (pagination / scope / sort) and movement-series shaping for the summary
 * endpoint. Kept free of Prisma imports so they can be unit-tested directly.
 */

// ── Pagination ───────────────────────────────────────────────────────────────

export interface PageParams {
  page: number
  pageSize: number
}

export interface ParsePageOptions {
  defaultPageSize?: number
  maxPageSize?: number
}

/** Clamp raw `page` / `pageSize` query params into safe integers. */
export function parsePageParams(
  pageRaw: string | null | undefined,
  pageSizeRaw: string | null | undefined,
  { defaultPageSize = 25, maxPageSize = 500 }: ParsePageOptions = {}
): PageParams {
  const pageNum = Number(pageRaw)
  const sizeNum = Number(pageSizeRaw)
  const page = Number.isInteger(pageNum) && pageNum >= 1 ? pageNum : 1
  const pageSize =
    Number.isInteger(sizeNum) && sizeNum >= 1 ? Math.min(sizeNum, maxPageSize) : defaultPageSize
  return { page, pageSize }
}

// ── Batch list scope + sort ──────────────────────────────────────────────────

/**
 * Workspace batch filters. RECEIVED/DEPLETED/VOIDED map to the stored status;
 * ACTIVE is an alias of RECEIVED; EXPIRING / EXPIRED are derived from BUD +
 * remaining stock and are resolved into date-range conditions server-side.
 */
export type BatchScope =
  | 'ACTIVE'
  | 'EXPIRING'
  | 'EXPIRED'
  | 'RECEIVED'
  | 'DEPLETED'
  | 'VOIDED'
  | 'ALL'

const BATCH_SCOPES: ReadonlySet<string> = new Set([
  'ACTIVE',
  'EXPIRING',
  'EXPIRED',
  'RECEIVED',
  'DEPLETED',
  'VOIDED',
  'ALL',
])

export function parseBatchScope(raw: string | null | undefined): BatchScope {
  const value = (raw ?? '').toUpperCase()
  return BATCH_SCOPES.has(value) ? (value as BatchScope) : 'ALL'
}

export type BatchSortKey = 'receivedOn' | 'bud' | 'qtyOnHand' | 'createdAt'
export type SortDir = 'asc' | 'desc'

const BATCH_SORT_KEYS: ReadonlySet<string> = new Set([
  'receivedOn',
  'bud',
  'qtyOnHand',
  'createdAt',
])

export function parseBatchSort(
  keyRaw: string | null | undefined,
  dirRaw: string | null | undefined
): { key: BatchSortKey; dir: SortDir } {
  const key = BATCH_SORT_KEYS.has(keyRaw ?? '') ? (keyRaw as BatchSortKey) : 'createdAt'
  const dir = dirRaw === 'asc' ? 'asc' : 'desc'
  return { key, dir }
}

// ── Expiry window ────────────────────────────────────────────────────────────

/** Batches whose BUD lands within this many days count as "expiring soon". */
export const EXPIRING_WINDOW_DAYS = 90

/** Start of the current UTC day (BUDs are stored as date-only UTC midnight). */
export function utcDayStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

/** [today, today + EXPIRING_WINDOW_DAYS] in UTC-midnight terms. */
export function expiringWindow(now: Date = new Date()): { start: Date; end: Date } {
  const start = utcDayStart(now)
  const end = new Date(start.getTime() + EXPIRING_WINDOW_DAYS * 86_400_000)
  return { start, end }
}

// ── Adjustment reason parsing ────────────────────────────────────────────────

export const ADJUSTMENT_REASONS = [
  'RECEIPT',
  'ORDER_FULFILLMENT',
  'RETURN',
  'MANUAL_ADJUSTMENT',
  'DAMAGE',
  'AUDIT',
] as const

export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number]

export function parseAdjustmentReason(raw: string | null | undefined): AdjustmentReason | undefined {
  const value = (raw ?? '').toUpperCase()
  return (ADJUSTMENT_REASONS as readonly string[]).includes(value)
    ? (value as AdjustmentReason)
    : undefined
}

/** Parse a YYYY-MM-DD (or ISO) date query param into a Date, else undefined. */
export function parseDateParam(raw: string | null | undefined): Date | undefined {
  if (!raw) return undefined
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? undefined : d
}

// ── Movement series (summary endpoint) ──────────────────────────────────────

export interface MovementRow {
  createdAt: Date | string
  delta: number
  reason: string
}

export interface MovementPoint {
  /** UTC date key, YYYY-MM-DD. */
  date: string
  /** Units added (receipts, returns, positive adjustments). */
  inbound: number
  /** Units removed (fulfillment, damage, negative adjustments) as a positive number. */
  outbound: number
  net: number
}

export interface ReasonTotal {
  reason: string
  inbound: number
  outbound: number
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Bucket raw adjustment rows into a continuous per-day inbound/outbound series
 * covering the trailing `days` window (zero-filled so charts have no gaps).
 */
export function buildMovementSeries(
  rows: MovementRow[],
  days: number,
  now: Date = new Date()
): MovementPoint[] {
  const end = utcDayStart(now)
  const start = new Date(end.getTime() - (days - 1) * 86_400_000)
  const byDay = new Map<string, MovementPoint>()
  for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) {
    const key = dateKey(new Date(t))
    byDay.set(key, { date: key, inbound: 0, outbound: 0, net: 0 })
  }
  for (const row of rows) {
    const created = typeof row.createdAt === 'string' ? new Date(row.createdAt) : row.createdAt
    const point = byDay.get(dateKey(created))
    if (!point) continue // outside the window
    if (row.delta >= 0) point.inbound += row.delta
    else point.outbound += -row.delta
    point.net += row.delta
  }
  return Array.from(byDay.values())
}

/** Total inbound/outbound units per adjustment reason (for the breakdown chart). */
export function buildReasonTotals(rows: MovementRow[]): ReasonTotal[] {
  const byReason = new Map<string, ReasonTotal>()
  for (const row of rows) {
    const entry = byReason.get(row.reason) ?? { reason: row.reason, inbound: 0, outbound: 0 }
    if (row.delta >= 0) entry.inbound += row.delta
    else entry.outbound += -row.delta
    byReason.set(row.reason, entry)
  }
  return Array.from(byReason.values()).sort(
    (a, b) => b.inbound + b.outbound - (a.inbound + a.outbound)
  )
}
