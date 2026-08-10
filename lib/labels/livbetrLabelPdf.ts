/**
 * LIVBETR white-label vial labels (OL4891LP 2.0" × 0.75").
 *
 * PeptSci-style overlays: BUD date, product name, dose + purity in the two-tone
 * box, Code 128 barcode, batch on the rail. Artwork viewBox is 130.11×47.58 —
 * fitted into 144×54 with **uniform** scale and vertical letterboxing.
 *
 * Typography:
 *   - Sofia Pro Regular — BUD date, batch value
 *   - Sofia Pro SemiBold — dose (mg) + HPLC (same weight as PeptSci dose)
 *   - Neuething Sans Medium Expanded — product name only
 * Static baked type (BUD:, RUO, PROVIDER USE ONLY…, BATCH:) stays on the
 * uploaded Neuething face in the template PNG — never re-drawn here.
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
import { SOFIA_PRO_REGULAR_B64 } from './embeddedAssets'
import {
  LIVBETR_TEMPLATE_PNG_B64,
  NEUETHING_SANS_MEDIUM_EXPANDED_B64,
  SOFIA_PRO_SEMIBOLD_B64,
} from './livbetrEmbeddedAssets'
import { normalizeDoseLabel, splitProductNameLines } from './peptsciLabelPdf'

const PT_PER_INCH = 72
const SHEET_WIDTH = 8.5 * PT_PER_INCH
const SHEET_HEIGHT = 11 * PT_PER_INCH
const COLS = 3
const ROWS = 12
const MAX_LABELS = COLS * ROWS

const LABEL_WIDTH = 2.0 * PT_PER_INCH // 144
const LABEL_HEIGHT = 0.75 * PT_PER_INCH // 54
const LEFT_MARGIN = 1.125 * PT_PER_INCH
const TOP_MARGIN = 0.3125 * PT_PER_INCH
const H_PITCH = 2.125 * PT_PER_INCH
const V_PITCH = 0.875 * PT_PER_INCH

/** Native SVG artwork size (livbetr-label-empty.svg). */
const SVG_W = 130.11
const SVG_H = 47.58
/** Fit width; letterbox vertically so type isn't anamorphically stretched. */
const SCALE = LABEL_WIDTH / SVG_W
const CONTENT_H = SVG_H * SCALE
const PAD_Y = (LABEL_HEIGHT - CONTENT_H) / 2

const COLOR_TEXT = rgb(0x23 / 255, 0x1f / 255, 0x20 / 255)
const COLOR_WHITE = rgb(1, 1, 1)
const COLOR_TEAL = rgb(0x28 / 255, 0x64 / 255, 0x6c / 255)

// Dose box (SVG units)
const DOSE_BOX_LEFT = 41.84
const DOSE_BOX_RIGHT = 66.06
const DOSE_BOX_BLACK_TOP = 22.17
const DOSE_BOX_BLACK_H = 6.86
const DOSE_BOX_TEAL_LEFT = 39.67
const DOSE_BOX_TEAL_WIDTH = 28.38
const DOSE_BOX_MID = 31.18
const DOSE_BOX_TEAL_H = 6.86
const DOSE_SIZE = 5.79 // Sofia Pro size from artwork (.st2)
const PURITY_SIZE = 5.79

// BUD date continues baked "BUD:" at (24.95, 4.81) size 3.72 — same optical line.
// Neuething "BUD:" ends ~35.4; small gap then Sofia date. Sofia metrics sit slightly
// lower than Neuething at the same baseline, so we pull the date up a hair.
const BUD_START_X = 36.9
const BUD_BASELINE = 4.88
const BUD_BASELINE_DAY = 5.3
const BUD_SIZE = 3.85
const BUD_SIZE_DAY = 4.6

// Name band: divider (~20) → just before warning column (~88)
const NAME_LEFT = 24
const NAME_RIGHT = 86
const NAME_BASELINE = 16.8
const NAME_SIZE_MAX = 7.2
const NAME_SIZE_MIN = 4.8
const NAME_LINE1_BASELINE = 14.2
const NAME_LINE2_BASELINE = 19.6
const NAME_LINE1_SIZE_MAX = 6.5
const NAME_LINE2_SIZE_MAX = 5.5
const NAME_LINE2_SIZE_MIN = 4.2

// Barcode well between warning column (~91–99) and BATCH rail (~126)
const BARCODE_LEFT = 99.5
const BARCODE_RIGHT = 122.2
const BARCODE_TOP = 2.0
const BARCODE_BOTTOM = 45.5

// BATCH: baked at (129.07, 43.73) rotate(-90) scale(1.22,1) — share that baseline X
// so the value is centered on the same rail as "BATCH:".
const BATCH_X = 129.07
const BATCH_BOTTOM = 22.5 // just above top of baked "BATCH:" run
const BATCH_TOP = 4
const BATCH_SIZE_MAX = 4.0

const FONT_DIR = path.join(process.cwd(), 'public', 'fonts', 'labels')
const TEMPLATE_CANDIDATES = [
  path.join(process.cwd(), 'public', 'labels', 'clients', 'livbetr', 'livbetr-label-template.png'),
]
const NEUETHING_CANDIDATES = [
  path.join(FONT_DIR, 'NeuethingSans-MediumExpanded.ttf'),
  path.join(FONT_DIR, 'NeuethingSans-MediumExpanded.otf'),
]
const SOFIA_CANDIDATES = [
  path.join(FONT_DIR, 'SofiaPro-Regular.ttf'),
  path.join(FONT_DIR, 'SofiaPro-Regular.otf'),
]
const SOFIA_SEMIBOLD_CANDIDATES = [
  path.join(FONT_DIR, 'SofiaPro-SemiBold.otf'),
  path.join(FONT_DIR, 'SofiaPro-SemiBold.ttf'),
  path.join(FONT_DIR, 'SofiaPro-Bold.otf'),
  path.join(FONT_DIR, 'SofiaPro-Bold.ttf'),
]

export type LivbetrLabelRequest = {
  productName: string
  dose: string
  purity: string
  batchNumber: string
  budIsoDate: string
  quantity: number
  proofMode?: boolean
}

export type LivbetrLabelGroup = {
  req: Omit<LivbetrLabelRequest, 'quantity' | 'proofMode'>
  quantity: number
  proofMode?: boolean
}

type LivbetrFonts = {
  name: PDFFont
  sofia: PDFFont
  sofiaBold: PDFFont
}

function parseBudParts(value: string): { month: string; day: string; year: string } {
  const v = value.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
  if (iso) return { year: iso[1].slice(-2), month: iso[2], day: iso[3] }
  const us4 = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(v)
  if (us4) return { month: us4[1], day: us4[2], year: us4[3].slice(-2) }
  const us2 = /^(\d{2})[-/](\d{2})[-/](\d{2})$/.exec(v)
  if (us2) return { month: us2[1], day: us2[2], year: us2[3] }
  return { month: '00', day: '00', year: '00' }
}

async function loadTemplateBytes(): Promise<Uint8Array> {
  for (const candidate of TEMPLATE_CANDIDATES) {
    try {
      await access(candidate)
      return new Uint8Array(await readFile(candidate))
    } catch {
      /* next */
    }
  }
  return Uint8Array.from(Buffer.from(LIVBETR_TEMPLATE_PNG_B64, 'base64'))
}

async function loadFontBytes(candidates: string[], fallbackB64: string): Promise<Uint8Array> {
  for (const p of candidates) {
    try {
      await access(p)
      return new Uint8Array(await readFile(p))
    } catch {
      /* next */
    }
  }
  return Uint8Array.from(Buffer.from(fallbackB64, 'base64'))
}

// --- Code 128 barcode (vector), same approach as PeptSci -------------------------

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

/**
 * 90°-rotated Code 128: bars run horizontally and stack top→bottom in the well.
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

function drawLabel(
  page: PDFPage,
  ox: number,
  oy: number,
  template: PDFImage,
  fonts: LivbetrFonts,
  req: Omit<LivbetrLabelRequest, 'quantity' | 'proofMode'>,
  proofMode: boolean
): void {
  const toX = (svgX: number) => ox + svgX * SCALE
  const toY = (svgY: number) => oy + PAD_Y + (SVG_H - svgY) * SCALE
  const sz = (svgPt: number) => svgPt * SCALE
  const { name: nameFont, sofia, sofiaBold } = fonts

  // White label stock, then artwork letterboxed (uniform scale).
  page.drawRectangle({
    x: ox,
    y: oy,
    width: LABEL_WIDTH,
    height: LABEL_HEIGHT,
    color: COLOR_WHITE,
  })
  page.drawImage(template, {
    x: ox,
    y: oy + PAD_Y,
    width: LABEL_WIDTH,
    height: CONTENT_H,
  })

  // BUD date MM/DD/YY — Sofia Pro, optically centered on baked "BUD:" baseline
  const { month, day, year } = parseBudParts(req.budIsoDate)
  let cursorX = BUD_START_X
  const drawBud = (
    text: string,
    sizeSvg: number,
    baselineSvg: number,
    color: ReturnType<typeof rgb>
  ) => {
    const size = sz(sizeSvg)
    page.drawText(text, {
      x: toX(cursorX),
      y: toY(baselineSvg),
      size,
      font: sofia,
      color,
    })
    cursorX += sofia.widthOfTextAtSize(text, size) / SCALE
  }
  drawBud(`${month}/`, BUD_SIZE, BUD_BASELINE, COLOR_TEXT)
  drawBud(day, BUD_SIZE_DAY, BUD_BASELINE_DAY, COLOR_TEAL)
  drawBud(`/${year}`, BUD_SIZE, BUD_BASELINE, COLOR_TEXT)

  // Product name — Neuething Expanded (brand face)
  const nameMaxWidth = (NAME_RIGHT - NAME_LEFT) * SCALE
  const nameCenterSvg = (NAME_LEFT + NAME_RIGHT) / 2
  const fitSize = (text: string, max: number, min: number) => {
    let sizeSvg = max
    while (sizeSvg > min && nameFont.widthOfTextAtSize(text, sz(sizeSvg)) > nameMaxWidth) {
      sizeSvg -= 0.2
    }
    return sizeSvg
  }
  const ellipsize = (text: string, sizeSvg: number) => {
    if (nameFont.widthOfTextAtSize(text, sz(sizeSvg)) <= nameMaxWidth) return text
    let t = text
    while (t.length > 1 && nameFont.widthOfTextAtSize(`${t}…`, sz(sizeSvg)) > nameMaxWidth) {
      t = t.slice(0, -1)
    }
    return `${t.trimEnd()}…`
  }
  const drawName = (text: string, sizeSvg: number, baseline: number) => {
    const fitted = ellipsize(text, sizeSvg)
    const size = sz(sizeSvg)
    const w = nameFont.widthOfTextAtSize(fitted, size)
    page.drawText(fitted, {
      x: toX(nameCenterSvg) - w / 2,
      y: toY(baseline),
      size,
      font: nameFont,
      color: COLOR_TEXT,
    })
  }

  const doseNormalized = normalizeDoseLabel(req.dose)
  const fitsOne =
    nameFont.widthOfTextAtSize(req.productName, sz(NAME_SIZE_MAX)) <= nameMaxWidth
  const nameLines = fitsOne ? [req.productName] : splitProductNameLines(req.productName)

  if (nameLines.length === 2) {
    const s1 = fitSize(nameLines[0], NAME_LINE1_SIZE_MAX, NAME_SIZE_MIN)
    const s2 = fitSize(nameLines[1], Math.min(NAME_LINE2_SIZE_MAX, s1), NAME_LINE2_SIZE_MIN)
    drawName(nameLines[0], s1, NAME_LINE1_BASELINE)
    drawName(nameLines[1], s2, NAME_LINE2_BASELINE)
  } else {
    drawName(nameLines[0], fitSize(nameLines[0], NAME_SIZE_MAX, NAME_SIZE_MIN), NAME_BASELINE)
  }

  // Dose centered in black band — Sofia Pro SemiBold (PeptSci dose weight)
  const doseParts = doseNormalized
    .split(/\s*\/\s*/)
    .map((p) => p.trim())
    .filter(Boolean)
  const primaryDose = (doseParts[0] ?? doseNormalized).toUpperCase().replace(/\s+/g, '')
  const doseMaxW = (DOSE_BOX_RIGHT - DOSE_BOX_LEFT - 2.5) * SCALE
  let doseSizeSvg = DOSE_SIZE
  while (
    doseSizeSvg > 3.2 &&
    sofiaBold.widthOfTextAtSize(primaryDose, sz(doseSizeSvg)) > doseMaxW
  ) {
    doseSizeSvg -= 0.2
  }
  const doseCx = (DOSE_BOX_LEFT + DOSE_BOX_RIGHT) / 2
  // Optical vertical center of black band → baseline for SemiBold caps
  const doseBaseline =
    DOSE_BOX_BLACK_TOP + DOSE_BOX_BLACK_H / 2 + doseSizeSvg * 0.35
  const doseW = sofiaBold.widthOfTextAtSize(primaryDose, sz(doseSizeSvg))
  page.drawText(primaryDose, {
    x: toX(doseCx) - doseW / 2,
    y: toY(doseBaseline),
    size: sz(doseSizeSvg),
    font: sofiaBold,
    color: COLOR_WHITE,
  })

  // Purity (HPLC) — cover baked glyphs + Sofia SemiBold (warning column untouched)
  const purityText = (req.purity || '99%HPLC').trim().toUpperCase().replace(/\s+/g, '')
  page.drawRectangle({
    x: toX(DOSE_BOX_TEAL_LEFT),
    y: toY(DOSE_BOX_MID + DOSE_BOX_TEAL_H),
    width: DOSE_BOX_TEAL_WIDTH * SCALE,
    height: DOSE_BOX_TEAL_H * SCALE,
    color: COLOR_TEAL,
  })

  if (doseParts.length >= 2) {
    const secondary = doseParts[1].toUpperCase().replace(/\s+/g, '')
    let s2 = DOSE_SIZE * 0.9
    while (s2 > 3 && sofiaBold.widthOfTextAtSize(secondary, sz(s2)) > doseMaxW) s2 -= 0.2
    const w2 = sofiaBold.widthOfTextAtSize(secondary, sz(s2))
    page.drawText(secondary, {
      x: toX(doseCx) - w2 / 2,
      y: toY(DOSE_BOX_MID + DOSE_BOX_TEAL_H / 2 + s2 * 0.35),
      size: sz(s2),
      font: sofiaBold,
      color: COLOR_WHITE,
    })
  } else {
    let puritySizeSvg = PURITY_SIZE
    while (
      puritySizeSvg > 3.2 &&
      sofiaBold.widthOfTextAtSize(purityText, sz(puritySizeSvg)) > doseMaxW
    ) {
      puritySizeSvg -= 0.2
    }
    const purityW = sofiaBold.widthOfTextAtSize(purityText, sz(puritySizeSvg))
    const purityBaseline =
      DOSE_BOX_MID + DOSE_BOX_TEAL_H / 2 + puritySizeSvg * 0.35
    page.drawText(purityText, {
      x: toX(doseCx) - purityW / 2,
      y: toY(purityBaseline),
      size: sz(puritySizeSvg),
      font: sofiaBold,
      color: COLOR_WHITE,
    })
  }

  // Code 128 barcode (rotated vertical bars) from batch number
  const bits = getCode128Bits(req.batchNumber)
  drawBarcodeBarsVertical(
    page,
    bits,
    toX(BARCODE_LEFT),
    toY(BARCODE_TOP),
    (BARCODE_RIGHT - BARCODE_LEFT) * SCALE,
    (BARCODE_BOTTOM - BARCODE_TOP) * SCALE
  )

  // Batch value above baked BATCH: — Sofia Pro, teal
  const batchAvail = (BATCH_BOTTOM - BATCH_TOP) * SCALE
  let batchSizeSvg = BATCH_SIZE_MAX
  while (
    batchSizeSvg > 2.8 &&
    sofia.widthOfTextAtSize(req.batchNumber, sz(batchSizeSvg)) > batchAvail
  ) {
    batchSizeSvg -= 0.15
  }
  page.drawText(req.batchNumber, {
    x: toX(BATCH_X),
    y: toY(BATCH_BOTTOM),
    size: sz(batchSizeSvg),
    font: sofia,
    color: COLOR_TEAL,
    rotate: degrees(90),
  })

  if (proofMode) {
    page.drawRectangle({
      x: ox + 0.75,
      y: oy + 0.75,
      width: LABEL_WIDTH - 1.5,
      height: LABEL_HEIGHT - 1.5,
      borderColor: rgb(0.85, 0.2, 0.2),
      borderWidth: 0.4,
    })
  }
}

export async function generateLivbetrLabelsPdf(groups: LivbetrLabelGroup[]): Promise<Buffer> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)

  const template = await doc.embedPng(await loadTemplateBytes())

  let nameFont: PDFFont
  try {
    nameFont = await doc.embedFont(
      await loadFontBytes(NEUETHING_CANDIDATES, NEUETHING_SANS_MEDIUM_EXPANDED_B64),
      { subset: true }
    )
  } catch {
    nameFont = await doc.embedFont(StandardFonts.Helvetica)
  }

  let sofia: PDFFont
  try {
    sofia = await doc.embedFont(await loadFontBytes(SOFIA_CANDIDATES, SOFIA_PRO_REGULAR_B64), {
      subset: true,
    })
  } catch {
    sofia = await doc.embedFont(StandardFonts.Helvetica)
  }

  let sofiaBold: PDFFont
  try {
    sofiaBold = await doc.embedFont(
      await loadFontBytes(SOFIA_SEMIBOLD_CANDIDATES, SOFIA_PRO_SEMIBOLD_B64),
      { subset: true }
    )
  } catch {
    sofiaBold = sofia
  }

  const fonts: LivbetrFonts = { name: nameFont, sofia, sofiaBold }

  let drew = false
  for (const group of groups) {
    const count = Math.max(0, Math.trunc(group.quantity))
    if (count <= 0) continue
    const proofMode = Boolean(group.proofMode)
    let i = 0
    while (i < count) {
      const page = doc.addPage([SHEET_WIDTH, SHEET_HEIGHT])
      for (let slot = 0; slot < MAX_LABELS && i < count; slot += 1, i += 1) {
        const row = Math.floor(slot / COLS)
        const col = slot % COLS
        const x = LEFT_MARGIN + col * H_PITCH
        const top = SHEET_HEIGHT - TOP_MARGIN - row * V_PITCH
        const y = top - LABEL_HEIGHT
        drawLabel(page, x, y, template, fonts, group.req, proofMode)
      }
      drew = true
    }
  }
  if (!drew) doc.addPage([SHEET_WIDTH, SHEET_HEIGHT])

  return Buffer.from(await doc.save())
}

export async function generateLivbetrLabelSheetPdf(
  input: LivbetrLabelRequest
): Promise<Buffer> {
  return generateLivbetrLabelsPdf([
    {
      req: {
        productName: input.productName,
        dose: input.dose,
        purity: input.purity,
        batchNumber: input.batchNumber,
        budIsoDate: input.budIsoDate,
      },
      quantity: input.quantity,
      proofMode: input.proofMode,
    },
  ])
}

export const LIVBETR_LABEL_SHEET_MAX = MAX_LABELS
