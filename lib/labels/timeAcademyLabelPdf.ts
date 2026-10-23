/**
 * TIME Academy of Regenerative Medicine & Longevity Science white-label vial
 * labels (OL4891LP 2.0" × 0.75").
 *
 * Own layout, from the client proof: logo panel, teal divider, product name
 * over the PeptSci dose box (black dose band, teal `99%HPLC` band, PUO mark),
 * and a right rail with `BATCH:` and `BUD` reading bottom-to-top. No barcode
 * and no warning column. The static artwork is baked by
 * `scripts/build-time-academy-template.ts`; geometry lives in
 * `./timeAcademyLayout` so artwork and overlays stay aligned.
 *
 * Each label is planned as text runs + cover rectangles
 * ({@link planTimeAcademyLabel}) and then drawn, so the placement rules are
 * unit-testable without parsing PDFs.
 *
 * Fonts: Sofia Pro Regular (name, dose — as in the proof) and Roboto Condensed
 * Regular (rail — the face of the PeptSci PUO mark).
 */

import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  setCharacterSpacing,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { bacWaterLabelVolume, usesPeptSciBacLabel } from '@/lib/shop/bac-water'
import { SOFIA_PRO_REGULAR_B64 } from './embeddedAssets'
import { normalizeDoseLabel, splitProductNameLines } from './peptsciLabelPdf'
import { OL4891LP, planLabelSheets } from './sheet-layout'
import { embedLabelFont } from './embed-font'
import {
  ROBOTO_CONDENSED_REGULAR_B64,
  TIME_ACADEMY_TEMPLATE_PNG_B64,
} from './timeAcademyEmbeddedAssets'
import {
  BAC_NAME_SIZE,
  DOSE_BASELINE,
  DOSE_BASELINE_TEAL,
  DOSE_BOX,
  DOSE_BOX_CENTER_X,
  DOSE_MAX_WIDTH,
  DOSE_SIZE,
  DOSE_SIZE_MIN,
  LABEL_H,
  LABEL_W,
  MARK_CLEAR,
  NAME_BASELINE,
  NAME_CENTER_X,
  NAME_LINE1_BASELINE,
  NAME_LINE1_SIZE_MAX,
  NAME_LINE2_SIZE_MAX,
  NAME_LINE2_SIZE_MIN,
  NAME_MAX_WIDTH,
  NAME_SIZE_MAX,
  NAME_SIZE_MIN,
  NAME_TRACKING_EM,
  PURITY_SIDE_BASELINE_X,
  PURITY_SIDE_SIZE,
  RAIL_BATCH_BASELINE_X,
  RAIL_BUD_BASELINE_X,
  RAIL_END_Y,
  RAIL_SIZE,
  RAIL_SIZE_MIN,
  RAIL_START_Y,
  TIME_ACADEMY_INK_HEX,
  TIME_ACADEMY_TEAL_HEX,
} from './timeAcademyLayout'

const SHEET_WIDTH = OL4891LP.sheetWidth
const SHEET_HEIGHT = OL4891LP.sheetHeight

const FONT_DIR = path.join(process.cwd(), 'public', 'fonts', 'labels')
const SOFIA_CANDIDATES = [path.join(FONT_DIR, 'SofiaPro-Regular.ttf')]
const ROBOTO_CANDIDATES = [path.join(FONT_DIR, 'RobotoCondensed-Regular.ttf')]
const TEMPLATE_CANDIDATES = [
  path.join(
    process.cwd(),
    'public',
    'labels',
    'clients',
    'time-academy',
    'time-academy-label-template.png'
  ),
]

function hexToRgb(hex: string) {
  const h = hex.replace('#', '')
  return rgb(
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255
  )
}

const COLORS = {
  ink: hexToRgb(TIME_ACADEMY_INK_HEX),
  teal: hexToRgb(TIME_ACADEMY_TEAL_HEX),
  white: rgb(1, 1, 1),
} as const

export type TimeAcademyLabelReq = {
  productName: string
  dose: string
  purity: string
  batchNumber: string
  /** BUD as YYYY-MM-DD. */
  budIsoDate: string
}

export type TimeAcademyLabelRequest = TimeAcademyLabelReq & {
  quantity: number
  proofMode?: boolean
}

export type TimeAcademyLabelGroup = {
  req: TimeAcademyLabelReq
  quantity: number
}

/** Advance width of `text` at `size` points, per font role. */
export type TimeAcademyMeasure = {
  sofia: (text: string, size: number) => number
  roboto: (text: string, size: number) => number
}

export type TimeAcademyTextRun = {
  role: 'name' | 'dose' | 'purity' | 'rail'
  text: string
  font: keyof TimeAcademyMeasure
  size: number
  /** Baseline origin in label points (y down); rotated runs read bottom-to-top from here. */
  x: number
  y: number
  color: keyof typeof COLORS
  rotate?: 90
  trackingEm?: number
}

/** Paint over baked artwork (label points, y down, `y` = top edge). */
export type TimeAcademyCover = {
  x: number
  y: number
  width: number
  height: number
  color: 'white' | 'teal'
}

export type TimeAcademyLabelPlan = {
  covers: TimeAcademyCover[]
  runs: TimeAcademyTextRun[]
}

/** Hides the baked PUO mark (BAC water). */
const MARK_COVER: TimeAcademyCover = {
  x: MARK_CLEAR.left,
  y: DOSE_BOX.top - 0.5,
  width: MARK_CLEAR.right - MARK_CLEAR.left,
  height: DOSE_BOX.bottom - DOSE_BOX.top + 1,
  color: 'white',
}

/** Hides the baked `99%HPLC`; the band's sides are straight above its rounded corners. */
const PURITY_COVER: TimeAcademyCover = {
  x: DOSE_BOX.left,
  y: DOSE_BOX.mid,
  width: DOSE_BOX.right - DOSE_BOX.left,
  height: DOSE_BOX.bottom - DOSE_BOX.corner - DOSE_BOX.mid,
  color: 'teal',
}

/** `MM/DD/YY` from `YYYY-MM-DD`, `MM/DD/YYYY` or `MM/DD/YY`; blank when unreadable. */
export function formatTimeAcademyBud(value: string): string {
  const v = value.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1].slice(-2)}`
  const us = /^(\d{2})[-/](\d{2})[-/](\d{4}|\d{2})$/.exec(v)
  if (us) return `${us[1]}/${us[2]}/${us[3].slice(-2)}`
  return ''
}

/** Rail text: `BATCH: <LOT>` and `BUD MM/DD/YY`; labels stay when a value is missing. */
export function timeAcademyRailLines(batchNumber: string, budIsoDate: string): [string, string] {
  const lot = batchNumber.trim().toUpperCase()
  const bud = formatTimeAcademyBud(budIsoDate)
  return [lot ? `BATCH: ${lot}` : 'BATCH:', bud ? `BUD ${bud}` : 'BUD']
}

/** Largest size in [min, max] (stepping down) at which `width(size)` fits `limit`. */
function fitSize(
  width: (size: number) => number,
  max: number,
  min: number,
  limit: number,
  step = 0.25
) {
  let size = max
  while (size > min && width(size) > limit) {
    size = Math.max(min, Math.round((size - step) * 100) / 100)
  }
  return size
}

function ellipsize(text: string, fits: (candidate: string) => boolean): string {
  if (fits(text)) return text
  let t = text
  while (t.length > 1 && !fits(`${t}…`)) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}

function normalizeReq(input: TimeAcademyLabelReq): TimeAcademyLabelReq {
  const bac = usesPeptSciBacLabel(input.productName, input.dose)
  return {
    productName: input.productName.trim().replace(/\s+/g, ' '),
    dose: bac ? bacWaterLabelVolume(input.productName, input.dose) : normalizeDoseLabel(input.dose),
    purity: bac ? '' : input.purity.trim(),
    batchNumber: input.batchNumber.trim().toUpperCase(),
    budIsoDate: input.budIsoDate.trim(),
  }
}

/**
 * Where every live piece of text goes on one label. Coordinates are label
 * points (y down); {@link TimeAcademyTextRun.x}/`y` are baseline origins.
 */
export function planTimeAcademyLabel(
  input: TimeAcademyLabelReq,
  measure: TimeAcademyMeasure
): TimeAcademyLabelPlan {
  const req = normalizeReq(input)
  const covers: TimeAcademyCover[] = []
  const runs: TimeAcademyTextRun[] = []

  const nameWidth = (text: string, size: number) =>
    measure.sofia(text, size) + NAME_TRACKING_EM * size * Math.max(0, text.length - 1)
  const nameRun = (
    text: string,
    size: number,
    baseline: number,
    color: TimeAcademyTextRun['color'] = 'ink',
    x = NAME_CENTER_X - nameWidth(text, size) / 2
  ): TimeAcademyTextRun => ({
    role: 'name',
    text,
    font: 'sofia',
    size,
    x,
    y: baseline,
    color,
    trackingEm: NAME_TRACKING_EM,
  })
  const fitName = (text: string, size: number) =>
    ellipsize(text, (candidate) => nameWidth(candidate, size) <= NAME_MAX_WIDTH)
  const doseRun = (text: string, baseline: number): TimeAcademyTextRun => {
    const size = fitSize((s) => measure.sofia(text, s), DOSE_SIZE, DOSE_SIZE_MIN, DOSE_MAX_WIDTH)
    return {
      role: 'dose',
      text,
      font: 'sofia',
      size,
      x: DOSE_BOX_CENTER_X - measure.sofia(text, size) / 2,
      y: baseline,
      color: 'white',
    }
  }

  // 3 mL / 10 mL BAC water: volume only, like the PeptSci BAC face.
  if (usesPeptSciBacLabel(req.productName, req.dose)) {
    covers.push(MARK_COVER, PURITY_COVER)
    runs.push(nameRun('BAC', BAC_NAME_SIZE, NAME_LINE1_BASELINE))
    runs.push(nameRun('Water', BAC_NAME_SIZE, NAME_BASELINE, 'teal'))
    runs.push(doseRun(req.dose, DOSE_BASELINE))
    return { covers, runs }
  }

  // Name: one line when it fits at full size, else two lines above the box
  // (line 2 on the one-line baseline) sized to the same rendered width.
  const lines =
    nameWidth(req.productName, NAME_SIZE_MAX) <= NAME_MAX_WIDTH
      ? [req.productName]
      : splitProductNameLines(req.productName)
  if (lines.length === 2) {
    const size1 = fitSize(
      (s) => nameWidth(lines[0], s),
      NAME_LINE1_SIZE_MAX,
      NAME_SIZE_MIN,
      NAME_MAX_WIDTH
    )
    const line1 = fitName(lines[0], size1)
    const unit2 = nameWidth(lines[1], 1)
    const matched = unit2 > 0 ? nameWidth(line1, size1) / unit2 : NAME_LINE2_SIZE_MAX
    const size2 = Math.max(NAME_LINE2_SIZE_MIN, Math.min(matched, size1, NAME_LINE2_SIZE_MAX))
    const line2 = fitName(lines[1], size2)
    runs.push(nameRun(line1, size1, NAME_LINE1_BASELINE))
    // "and <compound>": the compound in brand teal, like PeptSci's blue.
    const blend = /^(and\s+)(.+)$/i.exec(line2)
    if (blend) {
      const left = NAME_CENTER_X - nameWidth(line2, size2) / 2
      const compoundX = left + nameWidth(blend[1], size2) + NAME_TRACKING_EM * size2
      runs.push(nameRun(blend[1], size2, NAME_BASELINE, 'ink', left))
      runs.push(nameRun(blend[2], size2, NAME_BASELINE, 'teal', compoundX))
    } else {
      runs.push(nameRun(line2, size2, NAME_BASELINE))
    }
  } else {
    const size = fitSize(
      (s) => nameWidth(lines[0], s),
      NAME_SIZE_MAX,
      NAME_SIZE_MIN,
      NAME_MAX_WIDTH
    )
    runs.push(nameRun(fitName(lines[0], size), size, NAME_BASELINE))
  }

  // Dose: black band. Blends put the remaining doses in the teal band over the
  // baked purity, and the purity moves beside the box, rotated.
  const doseParts = req.dose
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
  if (doseParts.length >= 2 && doseParts.every((part) => /\d/.test(part))) {
    covers.push(PURITY_COVER)
    runs.push(doseRun(doseParts[0], DOSE_BASELINE))
    runs.push(
      doseRun(doseParts.slice(1).join(doseParts.length > 2 ? '/' : ' / '), DOSE_BASELINE_TEAL)
    )
    if (req.purity) {
      const width = measure.sofia(req.purity, PURITY_SIDE_SIZE)
      runs.push({
        role: 'purity',
        text: req.purity,
        font: 'sofia',
        size: PURITY_SIDE_SIZE,
        x: PURITY_SIDE_BASELINE_X,
        y: (DOSE_BOX.top + DOSE_BOX.bottom) / 2 + width / 2,
        color: 'ink',
        rotate: 90,
      })
    }
  } else if (req.dose) {
    runs.push(doseRun(req.dose, DOSE_BASELINE))
  }

  // Rail: both lines share one size and start, reading bottom-to-top.
  const railLines = timeAcademyRailLines(req.batchNumber, req.budIsoDate)
  const railLength = RAIL_START_Y - RAIL_END_Y
  const railSize = fitSize(
    (s) => Math.max(...railLines.map((line) => measure.roboto(line, s))),
    RAIL_SIZE,
    RAIL_SIZE_MIN,
    railLength,
    0.1
  )
  railLines.forEach((line, i) => {
    runs.push({
      role: 'rail',
      text: ellipsize(line, (candidate) => measure.roboto(candidate, railSize) <= railLength),
      font: 'roboto',
      size: railSize,
      x: i === 0 ? RAIL_BATCH_BASELINE_X : RAIL_BUD_BASELINE_X,
      y: RAIL_START_Y,
      color: 'ink',
      rotate: 90,
    })
  })

  return { covers, runs }
}

export type TimeAcademyFonts = Record<keyof TimeAcademyMeasure, PDFFont>

async function embedFirstFont(
  doc: PDFDocument,
  candidates: string[],
  fallbackB64: string
): Promise<PDFFont | null> {
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return await embedLabelFont(doc, await readFile(candidate))
    } catch {
      // try next / bundled copy
    }
  }
  try {
    return await embedLabelFont(doc, Buffer.from(fallbackB64, 'base64'))
  } catch {
    return null
  }
}

/** Brand fonts from disk, then the bundled copies, then Helvetica as a last resort. */
export async function embedTimeAcademyFonts(doc: PDFDocument): Promise<TimeAcademyFonts> {
  doc.registerFontkit(fontkit)
  const sofia = await embedFirstFont(doc, SOFIA_CANDIDATES, SOFIA_PRO_REGULAR_B64)
  const roboto = await embedFirstFont(doc, ROBOTO_CANDIDATES, ROBOTO_CONDENSED_REGULAR_B64)
  if (sofia && roboto) return { sofia, roboto }
  const helvetica = await doc.embedFont(StandardFonts.Helvetica)
  return { sofia: sofia ?? helvetica, roboto: roboto ?? helvetica }
}

function measureWith(fonts: TimeAcademyFonts): TimeAcademyMeasure {
  return {
    sofia: (text, size) => fonts.sofia.widthOfTextAtSize(text, size),
    roboto: (text, size) => fonts.roboto.widthOfTextAtSize(text, size),
  }
}

/** Disk template first, then the bundled copy; never falls back to another brand. */
async function loadTemplate(doc: PDFDocument): Promise<PDFImage> {
  for (const candidate of TEMPLATE_CANDIDATES) {
    try {
      await access(candidate)
      return await doc.embedPng(await readFile(candidate))
    } catch {
      // try next / bundled copy
    }
  }
  return doc.embedPng(Buffer.from(TIME_ACADEMY_TEMPLATE_PNG_B64, 'base64'))
}

function drawLabel(
  page: PDFPage,
  ox: number,
  oy: number,
  template: PDFImage,
  fonts: TimeAcademyFonts,
  plan: TimeAcademyLabelPlan,
  proofMode: boolean
): void {
  const toX = (sx: number) => ox + sx
  const toY = (sy: number) => oy + LABEL_H - sy

  page.drawImage(template, { x: ox, y: oy, width: LABEL_W, height: LABEL_H })
  for (const cover of plan.covers) {
    page.drawRectangle({
      x: toX(cover.x),
      y: toY(cover.y + cover.height),
      width: cover.width,
      height: cover.height,
      color: COLORS[cover.color],
    })
  }
  for (const run of plan.runs) {
    if (run.trackingEm) page.pushOperators(setCharacterSpacing(run.trackingEm * run.size))
    page.drawText(run.text, {
      x: toX(run.x),
      y: toY(run.y),
      size: run.size,
      font: fonts[run.font],
      color: COLORS[run.color],
      ...(run.rotate ? { rotate: degrees(run.rotate) } : {}),
    })
    if (run.trackingEm) page.pushOperators(setCharacterSpacing(0))
  }

  // Red outline = proof-only die-cut / label edge (OL4891LP). Not printed on stock.
  if (proofMode) {
    page.drawRectangle({
      x: ox + 0.75,
      y: oy + 0.75,
      width: LABEL_W - 1.5,
      height: LABEL_H - 1.5,
      borderColor: rgb(0.85, 0.2, 0.2),
      borderWidth: 0.4,
    })
  }
}

/**
 * Render a multi-batch label document. Labels flow continuously across full
 * OL4891LP sheets (36/page) from `startSlot`. Returns a PDF Buffer.
 */
export async function generateTimeAcademyLabelsPdf(
  groups: TimeAcademyLabelGroup[],
  options?: { startSlot?: number }
): Promise<{ pdf: Buffer; nextStartSlot: number; labelsPrinted: number; startSlot: number }> {
  const doc = await PDFDocument.create()
  const startSlot = options?.startSlot ?? 0
  const { pageCount, placements, nextStartSlot, labelsPrinted } = planLabelSheets(
    groups.map((group) => ({ req: group.req, quantity: group.quantity })),
    OL4891LP,
    { startSlot }
  )

  // Nothing to print still yields one blank sheet; returning before embedding
  // fonts avoids subsetting a font no glyph was drawn with.
  if (placements.length === 0) {
    doc.addPage([SHEET_WIDTH, SHEET_HEIGHT])
    return {
      pdf: Buffer.from(await doc.save()),
      nextStartSlot: startSlot,
      labelsPrinted: 0,
      startSlot,
    }
  }

  const fonts = await embedTimeAcademyFonts(doc)
  const measure = measureWith(fonts)
  const template = await loadTemplate(doc)
  const plans = new Map<TimeAcademyLabelReq, TimeAcademyLabelPlan>()
  const pages = Array.from({ length: pageCount }, () => doc.addPage([SHEET_WIDTH, SHEET_HEIGHT]))
  for (const { pageIndex, x, y, req } of placements) {
    let plan = plans.get(req)
    if (!plan) {
      plan = planTimeAcademyLabel(req, measure)
      plans.set(req, plan)
    }
    drawLabel(pages[pageIndex], x, y, template, fonts, plan, false)
  }

  return { pdf: Buffer.from(await doc.save()), nextStartSlot, labelsPrinted, startSlot }
}

/**
 * One batch as a print-ready sheet, or (proofMode) a single label centred on
 * the page with its die-cut outline. Returns a PDF Buffer.
 */
export async function generateTimeAcademyLabelSheetPdf(
  input: TimeAcademyLabelRequest
): Promise<Buffer> {
  const { quantity, proofMode, ...req } = input
  if (!proofMode) return (await generateTimeAcademyLabelsPdf([{ req, quantity }])).pdf

  const doc = await PDFDocument.create()
  const page = doc.addPage([SHEET_WIDTH, SHEET_HEIGHT])
  const fonts = await embedTimeAcademyFonts(doc)
  const template = await loadTemplate(doc)
  drawLabel(
    page,
    (SHEET_WIDTH - LABEL_W) / 2,
    (SHEET_HEIGHT - LABEL_H) / 2,
    template,
    fonts,
    planTimeAcademyLabel(req, measureWith(fonts)),
    true
  )
  return Buffer.from(await doc.save())
}
