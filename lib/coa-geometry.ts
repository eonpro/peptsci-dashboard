/**
 * Pure geometry/derivation helpers for the Certificate of Analysis charts.
 *
 * Kept free of React/DOM so the SVG coordinates can be unit-tested and reused
 * by both the storefront renderer and the admin live preview. All math mirrors
 * the reference supplier-certificate layout (letter page, 648px-wide SVGs).
 */

export function round(n: number, dp = 3): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

// -------------------------------------------------
// Purity — composition strip + log-scale impurity axis
// -------------------------------------------------

export interface PurityGeometry {
  purityPercent: number
  specMin: number // purity floor, e.g. 98
  impurities: number // 100 - purityPercent
  impurityAllowance: number // 100 - specMin
  marginFactor: number // allowance / impurities
  budgetConsumedPct: number // impurities / allowance * 100
  /** Composition strip (linear 0–100%) — SVG x range [16, 624]. */
  strip: { fillWidth: number; sliverX: number; sliverWidth: number }
  /** Log-scale impurity axis mapping (domain [0.01, 10]) → x. */
  logX: (v: number) => number
  measuredX: number
  rejectX: number
  measuredBarWidth: number
  rejectBarWidth: number
  gridlines: number[] // x positions of minor decade ticks
  ticks: { x: number; label: string }[]
}

const LOG_MIN = -2 // log10(0.01)
const LOG_MAX = 1 // log10(10)
const AXIS_X0 = 16
const AXIS_W = 608 // 624 - 16

export function computePurityGeometry(
  purityPercent: number,
  specMin = 98
): PurityGeometry {
  const impurities = round(100 - purityPercent, 3)
  const impurityAllowance = round(100 - specMin, 3)
  const marginFactor = impurities > 0 ? round(impurityAllowance / impurities, 2) : Infinity
  const budgetConsumedPct =
    impurityAllowance > 0 ? round((impurities / impurityAllowance) * 100, 1) : 0

  const fillWidth = round((purityPercent / 100) * AXIS_W, 1)

  const logX = (v: number): number => {
    const clamped = Math.min(10, Math.max(0.01, v))
    return round(AXIS_X0 + ((Math.log10(clamped) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * AXIS_W, 1)
  }

  const measuredX = logX(Math.max(0.01, impurities))
  const rejectX = logX(Math.max(0.01, impurityAllowance))

  // Minor gridlines: k×decade for decades 0.01, 0.1, 1 and k = 2..9.
  const gridlines: number[] = []
  for (const decade of [0.01, 0.1, 1]) {
    for (let k = 2; k <= 9; k++) gridlines.push(logX(decade * k))
  }

  const ticks = [0.01, 0.1, 1, 10].map((v) => ({
    x: logX(v),
    label: v === 10 ? '10' : v === 1 ? '1.0' : String(v),
  }))

  return {
    purityPercent,
    specMin,
    impurities,
    impurityAllowance,
    marginFactor,
    budgetConsumedPct,
    strip: {
      fillWidth,
      sliverX: round(AXIS_X0 + fillWidth, 1),
      sliverWidth: round(AXIS_W - fillWidth, 1),
    },
    logX,
    measuredX,
    rejectX,
    measuredBarWidth: round(measuredX - AXIS_X0, 1),
    rejectBarWidth: round(AXIS_X0 + AXIS_W - rejectX, 1),
    gridlines,
    ticks,
  }
}

// -------------------------------------------------
// Assay — % of label claim, axis 95–105 over SVG x [4, 644]
// -------------------------------------------------

export interface AssayGeometry {
  measuredMg: number
  labelClaimMg: number
  percentOfClaim: number
  deltaMg: number
  deltaPct: number
  x: (pct: number) => number
  targetX: number
  resultX: number
  barX: number // left edge of the deviation bar
  barWidth: number
  ticks: { x: number; label: string }[]
}

const ASSAY_MIN = 95
const ASSAY_MAX = 105
const ASSAY_X0 = 4
const ASSAY_W = 640 // 644 - 4

export function computeAssayGeometry(measuredMg: number, labelClaimMg: number): AssayGeometry {
  const percentOfClaim = labelClaimMg > 0 ? round((measuredMg / labelClaimMg) * 100, 1) : 0
  const deltaMg = round(measuredMg - labelClaimMg, 2)
  const deltaPct = round(percentOfClaim - 100, 1)

  const x = (pct: number): number => {
    const clamped = Math.min(ASSAY_MAX, Math.max(ASSAY_MIN, pct))
    return round(ASSAY_X0 + ((clamped - ASSAY_MIN) / (ASSAY_MAX - ASSAY_MIN)) * ASSAY_W, 1)
  }

  const targetX = x(100)
  const resultX = x(percentOfClaim)
  const barX = Math.min(targetX, resultX)
  const barWidth = round(Math.abs(resultX - targetX), 1)

  const ticks: { x: number; label: string }[] = []
  for (let p = ASSAY_MIN; p <= ASSAY_MAX; p++) ticks.push({ x: x(p), label: String(p) })

  return {
    measuredMg,
    labelClaimMg,
    percentOfClaim,
    deltaMg,
    deltaPct,
    x,
    targetX,
    resultX,
    barX,
    barWidth,
    ticks,
  }
}

// -------------------------------------------------
// Chain of custody — ordered → received → analyzed timeline
// -------------------------------------------------

export interface CustodyGeometry {
  orderedOn: Date
  receivedOn: Date
  analyzedOn: Date
  transitDays: number
  testingDays: number
  totalDays: number
  x: (d: Date) => number
  ticks: { x: number; label: string }[]
  monthLabel: string
  transit: { x: number; width: number }
  testing: { x: number; width: number }
  markers: { x: number; kind: 'start' | 'mid' | 'end' }[]
}

const CUSTODY_X0 = 78
const CUSTODY_X1 = 638
const DAY_MS = 24 * 60 * 60 * 1000

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS)
}

/**
 * Build the timeline. Requires received + analyzed dates; ordered defaults to
 * one week before receipt when not supplied. Returns null if the span is
 * non-positive or dates are invalid.
 */
export function computeCustodyGeometry(
  received: Date | null | undefined,
  analyzed: Date | null | undefined,
  ordered?: Date | null
): CustodyGeometry | null {
  if (!received || !analyzed) return null
  const receivedOn = new Date(received)
  const analyzedOn = new Date(analyzed)
  if (Number.isNaN(receivedOn.getTime()) || Number.isNaN(analyzedOn.getTime())) return null
  const orderedOn =
    ordered && !Number.isNaN(new Date(ordered).getTime())
      ? new Date(ordered)
      : new Date(receivedOn.getTime() - 7 * DAY_MS)

  const start = orderedOn.getTime() <= receivedOn.getTime() ? orderedOn : receivedOn
  const end = analyzedOn
  const totalDays = daysBetween(start, end)
  if (totalDays <= 0) return null

  const span = CUSTODY_X1 - CUSTODY_X0
  const x = (d: Date): number =>
    round(CUSTODY_X0 + (daysBetween(start, d) / totalDays) * span, 1)

  // Up to 11 evenly spaced day ticks.
  const tickCount = Math.min(totalDays + 1, 11)
  const ticks: { x: number; label: string }[] = []
  for (let i = 0; i < tickCount; i++) {
    const t = new Date(start.getTime() + (i * totalDays * DAY_MS) / (tickCount - 1 || 1))
    ticks.push({ x: round(CUSTODY_X0 + (i / (tickCount - 1 || 1)) * span, 1), label: String(t.getDate()) })
  }

  const monthFmt = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' })
  const monthLabel = monthFmt.format(start).toUpperCase()

  return {
    orderedOn,
    receivedOn,
    analyzedOn,
    transitDays: daysBetween(orderedOn, receivedOn),
    testingDays: daysBetween(receivedOn, analyzedOn),
    totalDays,
    x,
    ticks,
    monthLabel,
    transit: { x: x(orderedOn), width: round(x(receivedOn) - x(orderedOn), 1) },
    testing: { x: x(receivedOn), width: round(x(analyzedOn) - x(receivedOn), 1) },
    markers: [
      { x: x(orderedOn), kind: 'start' },
      { x: x(receivedOn), kind: 'mid' },
      { x: x(analyzedOn), kind: 'end' },
    ],
  }
}
