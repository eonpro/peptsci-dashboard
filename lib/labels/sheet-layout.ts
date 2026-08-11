/**
 * Pure slot planner for adhesive label sheets.
 *
 * Every brand prints on the same stock, and an order's labels must flow
 * continuously across a sheet's slots — an order for five compounds at three
 * vials each is 15 labels on ONE sheet, not five sheets holding three labels.
 * A run may therefore straddle a sheet boundary; it stays contiguous in the
 * stream, which is what matters when peeling labels in order.
 *
 * Holds no pdf-lib import so it is unit-testable in isolation (mirrors
 * lib/fulfillment/pick-list-core.ts). The brand modules in this directory feed
 * it their geometry and draw whatever it returns.
 *
 * @module lib/labels/sheet-layout
 */

const PT_PER_INCH = 72

/** Sheet and label measurements, in PDF points. */
export interface SheetGeometry {
  sheetWidth: number
  sheetHeight: number
  cols: number
  rows: number
  labelWidth: number
  labelHeight: number
  /** Sheet edge to the left edge of the first column. */
  leftMargin: number
  /** Sheet top to the top edge of the first row. */
  topMargin: number
  /** Column-to-column distance (label width + gutter). */
  hPitch: number
  /** Row-to-row distance (label height + gutter). */
  vPitch: number
}

/**
 * OnlineLabels **OL4891LP** — 2.0" x 0.75" labels, 36 per US-Letter sheet
 * (3 columns x 12 rows). Measurements from the OnlineLabels product spec.
 */
export const OL4891LP: SheetGeometry = {
  sheetWidth: 8.5 * PT_PER_INCH,
  sheetHeight: 11 * PT_PER_INCH,
  cols: 3,
  rows: 12,
  labelWidth: 2.0 * PT_PER_INCH, // 144
  labelHeight: 0.75 * PT_PER_INCH, // 54
  leftMargin: 1.125 * PT_PER_INCH, // 81
  topMargin: 0.3125 * PT_PER_INCH, // 22.5
  hPitch: 2.125 * PT_PER_INCH, // 153 (label + 0.125" gap)
  vPitch: 0.875 * PT_PER_INCH, // 63  (label + 0.125" gap)
}

/** Slots on one sheet. */
export function labelsPerSheet(geometry: SheetGeometry): number {
  return geometry.cols * geometry.rows
}

/** One run of identical labels. */
export interface LabelRun<T> {
  req: T
  quantity: number
}

/** Where a single label prints. */
export interface LabelPlacement<T> {
  /** Zero-based sheet index. */
  pageIndex: number
  /** Zero-based slot within the sheet, left to right then top to bottom. */
  slot: number
  /** Left edge, in points from the sheet's left. */
  x: number
  /** Bottom edge, in points from the sheet's bottom (pdf-lib's origin). */
  y: number
  req: T
}

/**
 * Lay every run out as one continuous stream of labels, wrapping to a new sheet
 * only once the current one is full. Runs with a non-positive quantity are
 * skipped; fractional quantities truncate toward zero.
 */
export function planLabelSheets<T>(
  runs: readonly LabelRun<T>[],
  geometry: SheetGeometry = OL4891LP
): { pageCount: number; placements: LabelPlacement<T>[] } {
  const perSheet = labelsPerSheet(geometry)
  const placements: LabelPlacement<T>[] = []

  let index = 0
  for (const run of runs) {
    const count = Math.max(0, Math.trunc(run.quantity))
    for (let n = 0; n < count; n += 1, index += 1) {
      const slot = index % perSheet
      const row = Math.floor(slot / geometry.cols)
      const col = slot % geometry.cols
      placements.push({
        pageIndex: Math.floor(index / perSheet),
        slot,
        x: geometry.leftMargin + col * geometry.hPitch,
        y: geometry.sheetHeight - geometry.topMargin - row * geometry.vPitch - geometry.labelHeight,
        req: run.req,
      })
    }
  }

  return { pageCount: Math.ceil(placements.length / perSheet), placements }
}
