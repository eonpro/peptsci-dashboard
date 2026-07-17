/**
 * Commission math for the affiliate partner program (ported from
 * eonpro/logosrx-website `src/lib/partners/commission.ts`).
 *
 * All money is integer cents and all rates are integer basis points
 * (100 bps = 1%), so splits are exact — no floating-point drift. The split
 * model: an org earns `orgRateBps` of every attributed transaction; when a
 * rep referred the clinic, the rep's `repRateBps` share is carved OUT of the
 * org's commission (so the platform always pays orgRate total, never more).
 *
 * Pure and dependency-free so it's trivially unit-testable; DB grouping and
 * accrual side effects live in lib/partners/accrual.ts and queries.ts.
 */

export const MAX_RATE_BPS = 10_000 // 100%

export type CommissionPayeeKind = 'ORG' | 'REP'
export type CommissionEntryStatusKind = 'PENDING' | 'APPROVED' | 'PAID'

export interface CommissionSplitInput {
  revenueCents: number
  orgRateBps: number
  /** Rep's carve-out rate; omit/0 for org-only attribution. */
  repRateBps?: number
}

export interface CommissionSplitEntry {
  payee: CommissionPayeeKind
  rateBps: number
  amountCents: number
}

/** Converts basis points to a display percentage (e.g. 750 → 7.5). */
export function bpsToPercent(bps: number): number {
  return bps / 100
}

/** Converts a percentage (possibly fractional, e.g. "7.5") to basis points. */
export function percentToBps(percent: number): number {
  return Math.round(percent * 100)
}

/** Converts Decimal/float dollars to integer cents (the partner-ledger unit). */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100)
}

/** Validates an org-level rate. Returns an error message or null when valid. */
export function validateOrgRateBps(rateBps: number): string | null {
  if (!Number.isInteger(rateBps)) return 'Commission rate must be a number.'
  if (rateBps < 0 || rateBps > MAX_RATE_BPS) {
    return 'Commission rate must be between 0% and 100%.'
  }
  return null
}

/**
 * Validates a rep's rate against their org's rate. The rep share comes out of
 * the org's commission, so it can never exceed it.
 */
export function validateRepRateBps(repRateBps: number, orgRateBps: number): string | null {
  if (!Number.isInteger(repRateBps)) return 'Commission rate must be a number.'
  if (repRateBps < 0) return 'Commission rate cannot be negative.'
  if (repRateBps > orgRateBps) {
    return `A rep's rate cannot exceed your organization's rate (${bpsToPercent(orgRateBps)}%).`
  }
  return null
}

/**
 * Computes the ledger entries for one transaction.
 *
 * The total paid out is always exactly `round(revenue × orgRate)`. The rep's
 * share is rounded independently and the org receives the remainder, so the
 * two entries always sum to the org-rate total to the cent.
 */
export function computeCommissionSplit(input: CommissionSplitInput): CommissionSplitEntry[] {
  const { revenueCents, orgRateBps } = input
  const repRateBps = input.repRateBps ?? 0

  if (!Number.isInteger(revenueCents) || revenueCents < 0) {
    throw new Error('revenueCents must be a non-negative integer')
  }
  const orgErr = validateOrgRateBps(orgRateBps)
  if (orgErr) throw new Error(orgErr)
  const repErr = validateRepRateBps(repRateBps, orgRateBps)
  if (repErr) throw new Error(repErr)

  const totalCents = Math.round((revenueCents * orgRateBps) / MAX_RATE_BPS)

  if (repRateBps <= 0) {
    return [{ payee: 'ORG', rateBps: orgRateBps, amountCents: totalCents }]
  }

  const repCents = Math.round((revenueCents * repRateBps) / MAX_RATE_BPS)
  return [
    {
      payee: 'ORG',
      rateBps: orgRateBps - repRateBps,
      amountCents: totalCents - repCents,
    },
    { payee: 'REP', rateBps: repRateBps, amountCents: repCents },
  ]
}

export interface CommissionRollupRow {
  payee: CommissionPayeeKind
  status: CommissionEntryStatusKind
  totalCents: number
}

export interface CommissionSummary {
  /** Amount earned by the viewer (org share for owners, rep share for reps). */
  ownCents: number
  /** Amount carved out to reps (org viewers only; 0 for reps). */
  repCents: number
  /** Viewer's not-yet-paid portion (pending + approved). */
  unpaidCents: number
  /** Viewer's already-paid portion. */
  paidCents: number
}

/**
 * Reduces grouped ledger rows (payee × status sums, EARNING minus REVERSAL)
 * into the headline numbers a partner dashboard shows.
 */
export function summarizeCommissionRows(
  rows: CommissionRollupRow[],
  viewer: CommissionPayeeKind
): CommissionSummary {
  const summary: CommissionSummary = {
    ownCents: 0,
    repCents: 0,
    unpaidCents: 0,
    paidCents: 0,
  }
  for (const row of rows) {
    if (row.payee === 'REP' && viewer === 'ORG') {
      summary.repCents += row.totalCents
    }
    if (row.payee !== viewer) continue
    summary.ownCents += row.totalCents
    if (row.status === 'PAID') summary.paidCents += row.totalCents
    else summary.unpaidCents += row.totalCents
  }
  return summary
}

/**
 * Computes the ledger entries for a margin-model transaction. The org earns
 * the full spread (margin = revenue − cost); the rep's rate is carved out of
 * that margin (rep share rounded, org gets the remainder so the two always sum
 * to the margin exactly). `rateBps` on each entry is that payee's share of the
 * margin in basis points.
 */
export function computeMarginSplit(input: {
  marginCents: number
  repRateBps?: number
}): CommissionSplitEntry[] {
  const { marginCents } = input
  const repRateBps = input.repRateBps ?? 0

  if (!Number.isInteger(marginCents) || marginCents < 0) {
    throw new Error('marginCents must be a non-negative integer')
  }
  if (!Number.isInteger(repRateBps) || repRateBps < 0 || repRateBps > MAX_RATE_BPS) {
    throw new Error('repRateBps out of range')
  }

  if (repRateBps <= 0) {
    return [{ payee: 'ORG', rateBps: MAX_RATE_BPS, amountCents: marginCents }]
  }

  const repCents = Math.round((marginCents * repRateBps) / MAX_RATE_BPS)
  return [
    {
      payee: 'ORG',
      rateBps: MAX_RATE_BPS - repRateBps,
      amountCents: marginCents - repCents,
    },
    { payee: 'REP', rateBps: repRateBps, amountCents: repCents },
  ]
}

/**
 * Computes the additional clawback (positive cents) to record for one payee
 * when a transaction's cumulative refunded total changes.
 *
 * The target cumulative reversal is proportional to how much of the revenue is
 * refunded: `round(earning × refundedTotal / revenue)`. We return the delta
 * since what's already been reversed, clamped at 0 (never "un-reverse"). A full
 * refund (`refundedTotal === revenue`) targets the entire earning, so reversals
 * net the payee's earning to exactly zero.
 */
export function reversalDelta(input: {
  earningCents: number
  alreadyReversedCents: number
  revenueCents: number
  refundedTotalCents: number
}): number {
  const { earningCents, alreadyReversedCents, revenueCents, refundedTotalCents } = input
  if (revenueCents <= 0 || earningCents <= 0) return 0
  const target = Math.round((earningCents * refundedTotalCents) / revenueCents)
  const delta = target - alreadyReversedCents
  return delta > 0 ? delta : 0
}

/**
 * Validates a clinic selling price against an org's wholesale floor for a SKU.
 * Returns an error message, or null when the price is valid (≥ floor).
 */
export function validateSellAboveFloor(
  sellCents: number,
  floorCents: number | null | undefined
): string | null {
  if (!Number.isInteger(sellCents) || sellCents < 0) {
    return 'Enter a valid price.'
  }
  if (floorCents != null && Number.isInteger(floorCents) && sellCents < floorCents) {
    return `Price can't be below your floor of ${formatCents(floorCents)}.`
  }
  return null
}

/** Formats integer cents as USD for display (e.g. 123456 → "$1,234.56"). */
export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  })
}

/** Formats basis points as a display percentage string (750 → "7.5%"). */
export function formatBps(bps: number): string {
  const pct = bpsToPercent(bps)
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}%`
}
