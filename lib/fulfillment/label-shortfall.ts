/**
 * Vial-label shortfalls, in operator-facing terms.
 *
 * A vial label can only be printed from an inventory batch — the batch owns the
 * batch number, BUD, purity and year colour that go on the label. So an order
 * line whose variant has no allocatable batch (RECEIVED, on-hand > 0, BUD not
 * past) yields NO label, and the printed sheet silently comes up short of what
 * the order says. This module turns that gap into a sentence the warehouse can
 * act on. Holds no Prisma/React imports so both the API route and the wizard can
 * use it, and so it is unit-testable in isolation.
 */

/** One product that could not be fully labelled. */
export interface LabelShortfallEntry {
  productName: string
  /** Dose as printed, or null when the product carries none. */
  dose: string | null
  /** Vials the order calls for. */
  needed: number
  /** Vials with no batch behind them, so no label. */
  short: number
}

/** Shape of the pick-list lines this module reads (structurally compatible with PickListLine). */
interface PickListLineLike {
  productName: string
  dose: string | null
  quantityNeeded: number
  shortfall: number
}

function asPositiveInt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0
}

function asName(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : 'Unknown product'
}

function asDose(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/**
 * Parse the `X-Label-Shortfall` response header. Defensive by design: the header
 * is advisory, so anything unparseable degrades to "no shortfall" rather than
 * breaking the print flow.
 */
export function parseLabelShortfall(raw: string | null | undefined): LabelShortfallEntry[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const entries: LabelShortfallEntry[] = []
  for (const row of parsed) {
    if (!row || typeof row !== 'object') continue
    const record = row as Record<string, unknown>
    const short = asPositiveInt(record.short)
    if (short === 0) continue
    entries.push({
      productName: asName(record.productName),
      dose: asDose(record.dose),
      needed: asPositiveInt(record.needed) || short,
      short,
    })
  }
  return entries
}

/**
 * Serialize entries for the `X-Label-Shortfall` header. Non-ASCII characters are
 * escaped to `\uXXXX` (still valid JSON, so the client decodes them back) because
 * a raw multi-byte product name in a header would make the whole PDF response
 * throw — a failed print is worse than a missing warning.
 */
export function serializeLabelShortfall(entries: readonly LabelShortfallEntry[]): string {
  if (entries.length === 0) return ''
  const payload = entries.map((e) => ({
    productName: e.productName,
    dose: e.dose,
    needed: e.needed,
    short: e.short,
  }))
  return JSON.stringify(payload).replace(/[^\x20-\x7e]/g, (c) => {
    return `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`
  })
}

/** Vials across the whole order that will go out unlabelled. */
export function labelShortfallTotal(entries: readonly LabelShortfallEntry[]): number {
  return entries.reduce((sum, e) => sum + e.short, 0)
}

/**
 * A single sentence naming every product that came up short, or null when the
 * sheet is complete.
 */
export function describeLabelShortfall(entries: readonly LabelShortfallEntry[]): string | null {
  if (entries.length === 0) return null
  const total = labelShortfallTotal(entries)
  const list = entries
    .map((e) => {
      const label = [e.productName, e.dose].filter(Boolean).join(' ')
      return `${label} (${e.short} of ${e.needed})`
    })
    .join(', ')
  return (
    `${total} ${total === 1 ? 'vial' : 'vials'} on this order printed no label: ${list}. ` +
    'A label needs a received batch with stock on hand and an unexpired BUD — ' +
    'receive or adjust the batch, then reprint before packing.'
  )
}

/**
 * Derive the same entries from a pick list, so the wizard can warn on the very
 * first screen instead of waiting for the operator to print.
 */
export function labelShortfallFromPickList(
  pickList: { lines: readonly PickListLineLike[] } | null | undefined
): LabelShortfallEntry[] {
  if (!pickList?.lines) return []
  return pickList.lines
    .filter((line) => asPositiveInt(line.shortfall) > 0)
    .map((line) => ({
      productName: asName(line.productName),
      dose: asDose(line.dose),
      needed: asPositiveInt(line.quantityNeeded) || asPositiveInt(line.shortfall),
      short: asPositiveInt(line.shortfall),
    }))
}
