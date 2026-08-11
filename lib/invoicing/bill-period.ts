/**
 * Bill-period helpers for Net 30 "tab" invoicing.
 *
 * Ops picks a calendar date range; unbilled orders whose create date falls
 * inside that range are selected for the invoice. Dates are YYYY-MM-DD in the
 * operator's local calendar (matches toLocaleDateString in the admin UI).
 */

/** Local calendar YYYY-MM-DD for a Date / ISO string. */
export function localYmd(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** True when createdAt's local calendar day is within [from, to] (inclusive). */
export function isOrderInBillPeriod(
  createdAt: Date | string,
  fromYmd?: string | null,
  toYmd?: string | null
): boolean {
  const ymd = localYmd(createdAt)
  if (fromYmd && ymd < fromYmd) return false
  if (toYmd && ymd > toYmd) return false
  return true
}

export type BillPeriodOrder = { createdAt: string; selected?: boolean }

/**
 * Mark orders selected when they fall in the bill period.
 * Empty from+to → select all (legacy New Invoice behavior).
 */
export function applyBillPeriodSelection<T extends BillPeriodOrder>(
  orders: T[],
  fromYmd?: string | null,
  toYmd?: string | null
): Array<T & { selected: boolean }> {
  const hasPeriod = Boolean(fromYmd || toYmd)
  return orders.map((o) => ({
    ...o,
    selected: hasPeriod ? isOrderInBillPeriod(o.createdAt, fromYmd, toYmd) : true,
  }))
}

/** Start of local calendar day as Date (for Prisma gte). */
export function billPeriodStart(fromYmd: string): Date {
  const [y, m, d] = fromYmd.split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0, 0)
}

/** End of local calendar day as Date (for Prisma lte). */
export function billPeriodEnd(toYmd: string): Date {
  const [y, m, d] = toYmd.split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59, 59, 999)
}

/** ISO strings for invoice.periodStart / periodEnd from YYYY-MM-DD inputs. */
export function billPeriodBounds(
  fromYmd?: string | null,
  toYmd?: string | null
): { periodStart: Date | null; periodEnd: Date | null } {
  return {
    periodStart: fromYmd ? billPeriodStart(fromYmd) : null,
    periodEnd: toYmd ? billPeriodEnd(toYmd) : null,
  }
}
