/**
 * PeptSci RUO Vial Label Generator
 * ================================
 *
 * Print-ready PDF label sheets for PeptSci research peptides, adapted from the
 * proven LogosRx model (eonpro/eonpro `src/lib/labels/vialLabelPdf.ts`).
 *
 * Stock: OnlineLabels **OL4891LP** — 2.0" x 0.75" labels, 36 per US-Letter
 * sheet (3 columns x 12 rows). Geometry constants below come from the
 * OnlineLabels product spec.
 *
 * Rendering strategy
 * ------------------
 * The authoritative artwork is the PeptSci-supplied SVG
 * (`public/labels/PEPTSCI LABEL SAMPLE.svg`, viewBox `0 0 144 54` = the label in
 * PDF points). All *static* brand elements (logo + molecule, divider, `BUD:`,
 * `RUO`, two-tone dose box with `99%HPLC`, the rotated `PROVIDER USE ONLY...`
 * warning, and `BATCH:`) are baked in; the *dynamic* fields are `display:none`.
 * `scripts/build-label-template.ts` rasterizes that SVG to a high-DPI PNG
 * (`public/labels/peptsci-label-template.png`). At print time we composite that
 * template as the label background and overlay ONLY the dynamic fields, placed
 * at the exact SVG placeholder coordinates:
 *
 *   - BUD date `MM/DD/YYYY` (day emphasized + accented) at (41.16, ~9)
 *   - Dose (e.g. `10mg`) in the black dose-box band, centered at (54.5, 31.21)
 *   - Code 128 barcode (rotated, vertical bars) filling x[102.5,128.76] y[2.4,51.3]
 *   - Product name (centered in the open area above the dose box)
 *   - Batch number, rotated, continuing the baked `BATCH:` label
 *
 * The barcode + all overlaid text are crisp PDF vectors. If the template PNG is
 * missing the engine falls back to a fully programmatic vector label so it can
 * still run with no assets.
 *
 * @module lib/labels/peptsciLabelPdf
 */

import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type PDFPage,
  type PDFFont,
  type PDFImage,
} from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import JsBarcode from 'jsbarcode'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  TEMPLATE_PNG_B64,
  AMERICAN_TYPEWRITER_CONDENSED_B64,
  SOFIA_PRO_REGULAR_B64,
} from './embeddedAssets'

const PT_PER_INCH = 72
const SHEET_WIDTH = 8.5 * PT_PER_INCH
const SHEET_HEIGHT = 11 * PT_PER_INCH
const COLS = 3
const ROWS = 12
const MAX_LABELS = COLS * ROWS

// OL4891LP geometry (inches -> points).
const LABEL_WIDTH = 2.0 * PT_PER_INCH // 144
const LABEL_HEIGHT = 0.75 * PT_PER_INCH // 54
const LEFT_MARGIN = 1.125 * PT_PER_INCH // 81
const TOP_MARGIN = 0.3125 * PT_PER_INCH // 22.5
const H_PITCH = 2.125 * PT_PER_INCH // 153 (label + 0.125" gap)
const V_PITCH = 0.875 * PT_PER_INCH // 63  (label + 0.125" gap)

// Brand palette (approximate; user-provided logo SVG/PNG is the source of truth
// for the mark itself). Accent (BUD day, dose-box bottom, batch text) defaults
// to PeptSci indigo and can be overridden per batch.
const COLOR_INDIGO = rgb(0x2b / 255, 0x2c / 255, 0x84 / 255)
const COLOR_NEAR_BLACK = rgb(0x1a / 255, 0x1a / 255, 0x1a / 255)
const COLOR_TEXT = rgb(0x23 / 255, 0x1f / 255, 0x20 / 255)
const COLOR_WHITE = rgb(1, 1, 1)

const LOGO_CANDIDATES = [
  path.join(process.cwd(), 'public', 'labels', 'peptsci-logo-vertical.png'),
  path.join(process.cwd(), 'assets', 'labels', 'peptsci-logo-vertical.png'),
  path.join(process.cwd(), 'public', 'labels', 'peptsci-logo.png'),
]

// Pre-rendered artwork (see scripts/build-label-template.ts).
const TEMPLATE_CANDIDATES = [
  path.join(process.cwd(), 'public', 'labels', 'peptsci-label-template.png'),
  path.join(process.cwd(), 'assets', 'labels', 'peptsci-label-template.png'),
]

// Brand fonts. The artwork's CSS uses American Typewriter (Condensed) for the
// BUD/BATCH typewriter fields and Sofia Pro for the dose. We embed (and subset)
// matching TTF/OTF files from public/fonts/labels when present; otherwise the
// engine falls back to PDF Standard-14 (Courier / Helvetica).
const FONT_DIR = path.join(process.cwd(), 'public', 'fonts', 'labels')
const fontPaths = (...names: string[]) => names.map((n) => path.join(FONT_DIR, n))
const AT_CONDENSED = fontPaths('AmericanTypewriter-Condensed.ttf', 'AmericanTypewriter-Regular.ttf')
const AT_CONDENSED_BOLD = fontPaths('AmericanTypewriter-CondensedBold.ttf', 'AmericanTypewriter-Bold.ttf')
const SOFIA_REGULAR = fontPaths('SofiaPro-Regular.otf', 'SofiaPro-Regular.ttf', 'SofiaPro-Medium.otf')
const SOFIA_BOLD = fontPaths(
  'SofiaPro-SemiBold.otf',
  'SofiaPro-Bold.otf',
  'SofiaPro-SemiBold.ttf',
  'SofiaPro-Bold.ttf'
)

// --- SVG artwork coordinate map ------------------------------------------------
// The source SVG viewBox is 0 0 144 54 (== the label in points), y growing DOWN.
// Placeholder positions/sizes are taken verbatim from the SVG's display:none
// dynamic layers so overlays land exactly where the artwork expects them.
const SVG_H = LABEL_HEIGHT // 54

// BUD date pieces (American Typewriter in the artwork; Courier-Bold here).
const BUD_START_X = 41.16
const BUD_BASELINE_SMALL = 8.7 // month + year baseline (SVG y, from top)
const BUD_BASELINE_DAY = 9.4 // emphasized day baseline
const BUD_SIZE_MONTH = 5.23
const BUD_SIZE_DAY = 7.61
const BUD_SIZE_YEAR = 4.75

// Dose box (two-tone) geometry from the artwork; dose text centered in the black
// (top) band. Purity ("99%HPLC") is baked into the template.
const DOSE_BOX_LEFT = 40.55
const DOSE_BOX_RIGHT = 68.56
const DOSE_BASELINE = 31.21
const DOSE_SIZE = 7.61

// Barcode well (the display:none bar group spans this rectangle, bars stacked
// vertically => a 90°-rotated Code 128).
const BARCODE_LEFT = 102.5
const BARCODE_RIGHT = 128.76
const BARCODE_TOP = 2.39
const BARCODE_BOTTOM = 51.26

// Product name: not in the artwork (no placeholder), placed in the open band
// above the dose box, between the divider and the warning column.
const NAME_LEFT = 28
const NAME_RIGHT = 86
const NAME_BASELINE = 20.5
const NAME_SIZE_MAX = 11

// Batch number value: continues the baked "BATCH:" label (rotated, far right).
const BATCH_X = 137.3
const BATCH_TOP = 3.5 // topmost SVG y the value may reach
const BATCH_BOTTOM = 34 // just above the baked "BATCH:" label

function hexToRgb(hex: string) {
  const h = hex.replace('#', '')
  return rgb(
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255
  )
}

export type PeptSciLabelRequest = {
  productName: string
  /** Dose-box top line, e.g. "10mg". */
  dose: string
  /** Dose-box bottom line, e.g. "99%HPLC". */
  purity: string
  /** Batch number; also the Code128 barcode payload. */
  batchNumber: string
  /** BUD as YYYY-MM-DD. */
  budIsoDate: string
  quantity: number
  proofMode?: boolean
  /** Accent hex (#rrggbb) for the BUD day + batch text. Defaults to indigo. */
  accentColor?: string
}

type BudParts = { month: string; day: string; year: string }

function parseBudDateParts(value: string): BudParts {
  const v = value.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
  if (iso) return { year: iso[1], month: iso[2], day: iso[3] }
  const us = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(v)
  if (us) return { month: us[1], day: us[2], year: us[3] }
  return { month: '00', day: '00', year: '0000' }
}

// --- Code 128 barcode (vector) -------------------------------------------------

type BarcodeEncoding = { data: string }
type BarcodeTarget = { encodings?: BarcodeEncoding[] }

function getCode128Bits(value: string): string {
  const target: BarcodeTarget = {}
  ;(JsBarcode as unknown as (t: unknown, v: string, o: Record<string, unknown>) => void)(
    target,
    value,
    { format: 'CODE128', displayValue: false, margin: 0, flat: true }
  )
  const encoded = target.encodings?.[0]?.data
  if (!encoded) throw new Error('Failed to generate Code 128 barcode encoding.')
  return encoded
}

/** Draw vertical Code128 bars filling [x, x+width] x [y, y+height]. */
function drawBarcodeBars(
  page: PDFPage,
  bits: string,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const moduleWidth = width / bits.length
  let idx = 0
  while (idx < bits.length) {
    if (bits[idx] !== '1') {
      idx += 1
      continue
    }
    let runEnd = idx + 1
    while (runEnd < bits.length && bits[runEnd] === '1') runEnd += 1
    page.drawRectangle({
      x: x + idx * moduleWidth,
      y,
      width: (runEnd - idx) * moduleWidth,
      height,
      color: rgb(0, 0, 0),
    })
    idx = runEnd
  }
}

/**
 * Draw a 90°-rotated Code 128: bars run horizontally (full `width`) and stack
 * along the vertical axis from the top of the well downward. `yTop` is the PDF
 * y of the top edge; `height` is the total well height.
 */
function drawBarcodeBarsVertical(
  page: PDFPage,
  bits: string,
  x: number,
  yTop: number,
  width: number,
  height: number
): void {
  const moduleHeight = height / bits.length
  let idx = 0
  while (idx < bits.length) {
    if (bits[idx] !== '1') {
      idx += 1
      continue
    }
    let runEnd = idx + 1
    while (runEnd < bits.length && bits[runEnd] === '1') runEnd += 1
    const runHeight = (runEnd - idx) * moduleHeight
    page.drawRectangle({
      x,
      y: yTop - idx * moduleHeight - runHeight,
      width,
      height: runHeight,
      color: rgb(0, 0, 0),
    })
    idx = runEnd
  }
}

// --- Brand mark ----------------------------------------------------------------

/** A small vector fallback evoking the PeptSci molecule + wordmark. */
function drawBrandFallback(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  font: PDFFont
): void {
  // Vertical "PeptSci" wordmark (rotated) + a little dot cluster, in indigo.
  const cx = x + width / 2
  const dotR = 1.6
  const baseY = y + 8
  const dots: Array<[number, number]> = [
    [cx - 4, baseY],
    [cx + 4, baseY],
    [cx, baseY - 4],
    [cx - 2, baseY + 4],
    [cx + 2, baseY + 4],
  ]
  for (const [dx, dy] of dots) {
    page.drawCircle({ x: dx, y: dy, size: dotR, color: COLOR_INDIGO })
  }
  page.drawText('PeptSci', {
    x: cx + 3,
    y: y + 16,
    size: 8,
    font,
    color: COLOR_INDIGO,
    rotate: degrees(90),
  })
}

// --- Label drawing -------------------------------------------------------------

type EmbeddedFonts = {
  helv: PDFFont
  helvBold: PDFFont
  serif: PDFFont
  serifBold: PDFFont
  mono: PDFFont
  monoBold: PDFFont
  // Brand-matched roles (fall back to the above when assets are absent).
  bud: PDFFont // American Typewriter Condensed — BUD date
  batch: PDFFont // American Typewriter Condensed — batch number
  dose: PDFFont // Sofia Pro — dose box
  name: PDFFont // Sofia Pro — peptide name
}

type LabelContext = {
  page: PDFPage
  x: number
  y: number
  req: PeptSciLabelRequest
  fonts: EmbeddedFonts
  logo: PDFImage | null
  template: PDFImage | null
  accent: ReturnType<typeof rgb>
}

/**
 * Composite the PeptSci artwork template and overlay the dynamic fields at the
 * exact SVG placeholder coordinates. Coordinate helpers convert from the SVG
 * space (origin top-left, y down) to PDF space (origin bottom-left, y up).
 */
function drawLabel(ctx: LabelContext): void {
  if (!ctx.template) {
    drawLabelVector(ctx)
    return
  }
  const { page, x, y, req, fonts, template, accent } = ctx

  // Background artwork (logo, divider, BUD:, RUO, dose box + 99%HPLC, warning,
  // BATCH:) — fills the whole label.
  page.drawImage(template, { x, y, width: LABEL_WIDTH, height: LABEL_HEIGHT })

  // SVG (top-left, y-down) -> PDF (bottom-left, y-up) for a text baseline / point.
  const toX = (sx: number) => x + sx
  const toY = (sy: number) => y + (SVG_H - sy)

  // --- BUD date: MM/ + DD (emphasized, accented) + /YYYY, drawn contiguously.
  const { month, day, year } = parseBudDateParts(req.budIsoDate)
  let cursor = BUD_START_X
  const monthText = `${month}/`
  page.drawText(monthText, {
    x: toX(cursor),
    y: toY(BUD_BASELINE_SMALL),
    size: BUD_SIZE_MONTH,
    font: fonts.bud,
    color: COLOR_TEXT,
  })
  cursor += fonts.bud.widthOfTextAtSize(monthText, BUD_SIZE_MONTH)
  page.drawText(day, {
    x: toX(cursor),
    y: toY(BUD_BASELINE_DAY),
    size: BUD_SIZE_DAY,
    font: fonts.bud,
    color: accent,
  })
  cursor += fonts.bud.widthOfTextAtSize(day, BUD_SIZE_DAY)
  page.drawText(`/${year}`, {
    x: toX(cursor),
    y: toY(BUD_BASELINE_SMALL),
    size: BUD_SIZE_YEAR,
    font: fonts.bud,
    color: COLOR_TEXT,
  })

  // --- Product name: auto-fit, centered in the open band above the dose box.
  const nameMaxWidth = NAME_RIGHT - NAME_LEFT
  let nameSize = NAME_SIZE_MAX
  while (nameSize > 5 && fonts.name.widthOfTextAtSize(req.productName, nameSize) > nameMaxWidth) {
    nameSize -= 0.25
  }
  const nameWidth = fonts.name.widthOfTextAtSize(req.productName, nameSize)
  page.drawText(req.productName, {
    x: toX((NAME_LEFT + NAME_RIGHT) / 2 - nameWidth / 2),
    y: toY(NAME_BASELINE),
    size: nameSize,
    font: fonts.name,
    color: COLOR_TEXT,
  })

  // --- Dose: white, centered in the black (top) band of the dose box.
  const doseWidth = fonts.dose.widthOfTextAtSize(req.dose, DOSE_SIZE)
  const doseCx = (DOSE_BOX_LEFT + DOSE_BOX_RIGHT) / 2
  page.drawText(req.dose, {
    x: toX(doseCx - doseWidth / 2),
    y: toY(DOSE_BASELINE),
    size: DOSE_SIZE,
    font: fonts.dose,
    color: COLOR_WHITE,
  })

  // --- Code 128 barcode: rotated (vertical bars) filling the artwork's well.
  const bits = getCode128Bits(req.batchNumber)
  drawBarcodeBarsVertical(
    page,
    bits,
    toX(BARCODE_LEFT),
    toY(BARCODE_TOP),
    BARCODE_RIGHT - BARCODE_LEFT,
    BARCODE_BOTTOM - BARCODE_TOP
  )

  // --- Batch number value: rotated 90°, continuing the baked "BATCH:" label.
  const batchAvail = BATCH_BOTTOM - BATCH_TOP
  let batchSize = 6
  while (batchSize > 3.5 && fonts.batch.widthOfTextAtSize(req.batchNumber, batchSize) > batchAvail) {
    batchSize -= 0.25
  }
  page.drawText(req.batchNumber, {
    x: toX(BATCH_X),
    y: toY(BATCH_BOTTOM),
    size: batchSize,
    font: fonts.batch,
    color: accent,
    rotate: degrees(90),
  })
}

function drawLabelVector({ page, x, y, req, fonts, logo, accent }: LabelContext): void {
  const fullWidth = LABEL_WIDTH
  const fullHeight = LABEL_HEIGHT
  const gap = 3

  // Column widths (points).
  const brandWidth = 26
  const batchWidth = 11
  const barcodeWidth = 24
  const warningWidth = 17
  const contentX = x + brandWidth + gap
  const contentWidth =
    fullWidth - brandWidth - warningWidth - barcodeWidth - batchWidth - gap * 4
  const warningX = contentX + contentWidth + gap
  const barcodeX = warningX + warningWidth + gap
  const batchX = barcodeX + barcodeWidth + gap

  const top = y + fullHeight
  const padY = 4
  const contentTop = top - padY
  const contentBottom = y + padY
  const contentHeight = contentTop - contentBottom

  // Divider between brand column and content.
  page.drawLine({
    start: { x: x + brandWidth, y: y + 3 },
    end: { x: x + brandWidth, y: top - 3 },
    thickness: 0.6,
    color: COLOR_INDIGO,
  })

  // Brand / logo.
  if (logo) {
    const logoH = fullHeight - padY * 2
    const logoW = Math.min(brandWidth - 2, (logo.width / logo.height) * logoH)
    page.drawImage(logo, {
      x: x + (brandWidth - logoW) / 2,
      y: y + (fullHeight - logoH) / 2,
      width: logoW,
      height: logoH,
    })
  } else {
    drawBrandFallback(page, x, y, brandWidth, fullHeight, fonts.serif)
  }

  // BUD line: "BUD: MM/DD/YYYY" with the day in the accent color.
  const { month, day, year } = parseBudDateParts(req.budIsoDate)
  const budY = contentTop - 5
  const budSize = 6.5
  let cursor = contentX
  page.drawText('BUD: ', { x: cursor, y: budY, size: budSize, font: fonts.serif, color: COLOR_TEXT })
  cursor += fonts.serif.widthOfTextAtSize('BUD: ', budSize)
  page.drawText(`${month}/`, { x: cursor, y: budY, size: budSize, font: fonts.serif, color: COLOR_TEXT })
  cursor += fonts.serif.widthOfTextAtSize(`${month}/`, budSize)
  page.drawText(day, { x: cursor, y: budY, size: budSize + 0.5, font: fonts.serifBold, color: accent })
  cursor += fonts.serifBold.widthOfTextAtSize(day, budSize + 0.5)
  page.drawText(`/${year}`, { x: cursor, y: budY, size: budSize, font: fonts.serif, color: COLOR_TEXT })

  // Product name (auto-fit to content width).
  const nameMaxWidth = contentWidth - 1
  let nameSize = 10.5
  while (
    nameSize > 5 &&
    fonts.helv.widthOfTextAtSize(req.productName, nameSize) > nameMaxWidth
  ) {
    nameSize -= 0.25
  }
  const nameY = budY - 12
  page.drawText(req.productName, {
    x: contentX,
    y: nameY,
    size: nameSize,
    font: fonts.helv,
    color: COLOR_TEXT,
  })

  // Two-tone dose box + rotated "RUO" to its left.
  const ruoWidth = 8
  const boxX = contentX + ruoWidth
  const boxWidth = contentWidth - ruoWidth
  const boxBottom = contentBottom
  const boxHeight = 19
  const halfH = boxHeight / 2

  // Top half (near-black) — dose.
  page.drawRectangle({
    x: boxX,
    y: boxBottom + halfH,
    width: boxWidth,
    height: halfH,
    color: COLOR_NEAR_BLACK,
  })
  // Bottom half (accent) — purity.
  page.drawRectangle({
    x: boxX,
    y: boxBottom,
    width: boxWidth,
    height: halfH,
    color: accent,
  })
  // Rounded outer outline to soften corners.
  page.drawRectangle({
    x: boxX,
    y: boxBottom,
    width: boxWidth,
    height: boxHeight,
    borderColor: COLOR_WHITE,
    borderWidth: 0,
  })

  const doseSize = 8
  page.drawText(req.dose, {
    x: boxX + (boxWidth - fonts.helvBold.widthOfTextAtSize(req.dose, doseSize)) / 2,
    y: boxBottom + halfH + (halfH - doseSize) / 2 + 1,
    size: doseSize,
    font: fonts.helvBold,
    color: COLOR_WHITE,
  })
  const puritySize = 7
  page.drawText(req.purity, {
    x: boxX + (boxWidth - fonts.helvBold.widthOfTextAtSize(req.purity, puritySize)) / 2,
    y: boxBottom + (halfH - puritySize) / 2 + 1,
    size: puritySize,
    font: fonts.helvBold,
    color: COLOR_WHITE,
  })

  // Rotated "RUO" (Research Use Only).
  const ruoText = 'RUO'
  const ruoSize = 7
  const ruoTextW = fonts.helv.widthOfTextAtSize(ruoText, ruoSize)
  page.drawText(ruoText, {
    x: contentX + 5,
    y: boxBottom + (boxHeight - ruoTextW) / 2,
    size: ruoSize,
    font: fonts.helv,
    color: COLOR_TEXT,
    rotate: degrees(90),
  })

  // Rotated warning block.
  const warningLines = ['PROVIDER USE ONLY', 'NOT FOR HUMAN OR', 'ANIMAL CONSUMPTION']
  const wSize = 4.6
  const wStep = warningWidth / (warningLines.length + 0.5)
  warningLines.forEach((line, i) => {
    const lineW = fonts.helvBold.widthOfTextAtSize(line, wSize)
    page.drawText(line, {
      x: warningX + wStep * (i + 0.6),
      y: contentBottom + (contentHeight - lineW) / 2,
      size: wSize,
      font: fonts.helvBold,
      color: COLOR_TEXT,
      rotate: degrees(90),
    })
  })

  // Code128 barcode (vertical bars).
  const bits = getCode128Bits(req.batchNumber)
  const barsHeight = contentHeight
  const barsWidth = barcodeWidth - 2
  drawBarcodeBars(page, bits, barcodeX + 1, contentBottom, barsWidth, barsHeight)

  // Rotated "BATCH: <number>" in accent.
  const batchText = `BATCH: ${req.batchNumber}`
  let batchSize = 7
  while (batchSize > 4 && fonts.serifBold.widthOfTextAtSize(batchText, batchSize) > contentHeight) {
    batchSize -= 0.25
  }
  const batchTextW = fonts.serifBold.widthOfTextAtSize(batchText, batchSize)
  page.drawText(batchText, {
    x: batchX + batchWidth / 2 + batchSize / 2,
    y: contentBottom + (contentHeight - batchTextW) / 2,
    size: batchSize,
    font: fonts.serifBold,
    color: accent,
    rotate: degrees(90),
  })
}

async function embedPngFrom(doc: PDFDocument, candidates: string[]): Promise<PDFImage | null> {
  for (const candidate of candidates) {
    try {
      await access(candidate)
      const bytes = await readFile(candidate)
      return await doc.embedPng(bytes)
    } catch {
      // try next / fall through
    }
  }
  return null
}

const loadLogo = (doc: PDFDocument) => embedPngFrom(doc, LOGO_CANDIDATES)

/**
 * Load the artwork template. Prefers a (possibly higher-res / updated) PNG on
 * disk, then falls back to the base64 copy embedded in the bundle so this works
 * on serverless platforms (Vercel) that don't ship `public/` to functions.
 */
async function loadTemplate(doc: PDFDocument): Promise<PDFImage | null> {
  const fromDisk = await embedPngFrom(doc, TEMPLATE_CANDIDATES)
  if (fromDisk) return fromDisk
  try {
    return await doc.embedPng(Buffer.from(TEMPLATE_PNG_B64, 'base64'))
  } catch {
    return null
  }
}

/** Embed (and subset) the first available custom font file, else null. */
async function loadFontFrom(doc: PDFDocument, candidates: string[]): Promise<PDFFont | null> {
  for (const candidate of candidates) {
    try {
      await access(candidate)
      const bytes = await readFile(candidate)
      return await doc.embedFont(bytes, { subset: true })
    } catch {
      // try next / fall through
    }
  }
  return null
}

/** Embed a base64 font (bundled fallback). */
async function embedB64Font(doc: PDFDocument, b64: string): Promise<PDFFont | null> {
  try {
    return await doc.embedFont(Buffer.from(b64, 'base64'), { subset: true })
  } catch {
    return null
  }
}

async function embedFonts(doc: PDFDocument): Promise<EmbeddedFonts> {
  doc.registerFontkit(fontkit)
  const helv = await doc.embedFont(StandardFonts.Helvetica)
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const serif = await doc.embedFont(StandardFonts.TimesRoman)
  const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold)
  const mono = await doc.embedFont(StandardFonts.Courier)
  const monoBold = await doc.embedFont(StandardFonts.CourierBold)

  // Brand fonts: disk override first, then the bundled base64 copy, then the
  // Standard-14 substitute as a last resort.
  const atCond =
    (await loadFontFrom(doc, AT_CONDENSED)) ??
    (await embedB64Font(doc, AMERICAN_TYPEWRITER_CONDENSED_B64))
  const atCondBold = (await loadFontFrom(doc, AT_CONDENSED_BOLD)) ?? atCond
  const sofia =
    (await loadFontFrom(doc, SOFIA_REGULAR)) ?? (await embedB64Font(doc, SOFIA_PRO_REGULAR_B64))
  const sofiaBold = (await loadFontFrom(doc, SOFIA_BOLD)) ?? sofia

  return {
    helv,
    helvBold,
    serif,
    serifBold,
    mono,
    monoBold,
    bud: atCond ?? mono,
    batch: atCondBold ?? monoBold,
    dose: sofiaBold ?? helvBold,
    name: sofiaBold ?? helvBold,
  }
}

function normalizeReq(input: PeptSciLabelRequest): PeptSciLabelRequest {
  return { ...input, batchNumber: input.batchNumber.trim().toUpperCase() }
}

/** One run of identical labels for a single batch. */
export type PeptSciLabelGroup = {
  req: Omit<PeptSciLabelRequest, 'quantity' | 'proofMode'>
  quantity: number
}

/**
 * Render a multi-batch, multi-page label document. Each group's labels flow
 * across full OL4891LP sheets (36/page) and every new group starts on a fresh
 * page so a batch's labels stay contiguous. Returns a PDF Buffer.
 */
export async function generatePeptSciLabelsPdf(groups: PeptSciLabelGroup[]): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const fonts = await embedFonts(doc)
  const logo = await loadLogo(doc)
  const template = await loadTemplate(doc)

  let drewAnything = false
  for (const group of groups) {
    const count = Math.max(0, Math.trunc(group.quantity))
    if (count <= 0) continue
    const req = normalizeReq({ ...group.req, quantity: count })
    const accent = req.accentColor ? hexToRgb(req.accentColor) : COLOR_INDIGO

    let i = 0
    while (i < count) {
      const page = doc.addPage([SHEET_WIDTH, SHEET_HEIGHT])
      for (let slot = 0; slot < MAX_LABELS && i < count; slot += 1, i += 1) {
        const row = Math.floor(slot / COLS)
        const col = slot % COLS
        const x = LEFT_MARGIN + col * H_PITCH
        const top = SHEET_HEIGHT - TOP_MARGIN - row * V_PITCH
        const y = top - LABEL_HEIGHT
        drawLabel({ page, x, y, req, fonts, logo, template, accent })
      }
      drewAnything = true
    }
  }

  if (!drewAnything) {
    doc.addPage([SHEET_WIDTH, SHEET_HEIGHT])
  }

  const bytes = await doc.save()
  return Buffer.from(bytes)
}

/**
 * Render a print-ready OL4891LP label sheet (or a single centered proof label)
 * for one batch. Returns a PDF Buffer.
 */
export async function generatePeptSciLabelSheetPdf(input: PeptSciLabelRequest): Promise<Buffer> {
  if (input.proofMode) {
    const doc = await PDFDocument.create()
    const page = doc.addPage([SHEET_WIDTH, SHEET_HEIGHT])
    const fonts = await embedFonts(doc)
    const logo = await loadLogo(doc)
    const template = await loadTemplate(doc)
    const accent = input.accentColor ? hexToRgb(input.accentColor) : COLOR_INDIGO
    const x = (SHEET_WIDTH - LABEL_WIDTH) / 2
    const y = (SHEET_HEIGHT - LABEL_HEIGHT) / 2
    drawLabel({ page, x, y, req: normalizeReq(input), fonts, logo, template, accent })
    return Buffer.from(await doc.save())
  }

  const { productName, dose, purity, batchNumber, budIsoDate, accentColor, quantity } = input
  return generatePeptSciLabelsPdf([
    { req: { productName, dose, purity, batchNumber, budIsoDate, accentColor }, quantity },
  ])
}

/**
 * Render a single label on a label-sized page (2.0" x 0.75"). Useful for inline
 * previews/thumbnails. Returns a PDF Buffer.
 */
export async function generatePeptSciSingleLabelPdf(
  input: Omit<PeptSciLabelRequest, 'quantity' | 'proofMode'>
): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([LABEL_WIDTH, LABEL_HEIGHT])
  const fonts = await embedFonts(doc)
  const logo = await loadLogo(doc)
  const template = await loadTemplate(doc)
  const accent = input.accentColor ? hexToRgb(input.accentColor) : COLOR_INDIGO
  drawLabel({
    page,
    x: 0,
    y: 0,
    req: normalizeReq({ ...input, quantity: 1 }),
    fonts,
    logo,
    template,
    accent,
  })
  return Buffer.from(await doc.save())
}

export const PEPTSCI_LABEL_SHEET_MAX = MAX_LABELS
