/**
 * LIVBETR white-label vial labels (OL4891LP 2.0" × 0.75").
 *
 * Same overlay family as PeptSci (BUD date, product name, dose in black band,
 * batch on the right rail). Artwork viewBox is 130.11×47.58 — stretched to the
 * full 144×54 label; overlay coords are SVG units scaled accordingly.
 * Dynamic typeface: Neuething Sans Medium Expanded.
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
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  LIVBETR_TEMPLATE_PNG_B64,
  NEUETHING_SANS_MEDIUM_EXPANDED_B64,
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
const SX = LABEL_WIDTH / SVG_W
const SY = LABEL_HEIGHT / SVG_H

const COLOR_TEXT = rgb(0x23 / 255, 0x1f / 255, 0x20 / 255)
const COLOR_WHITE = rgb(1, 1, 1)
const COLOR_TEAL = rgb(0x28 / 255, 0x64 / 255, 0x6c / 255)

// Dose box (from SVG paths)
const DOSE_BOX_LEFT = 41.84
const DOSE_BOX_RIGHT = 67.9
const DOSE_BOX_MID = 31.18
const DOSE_BASELINE = 27.0
const DOSE_SIZE = 6.5

// BUD date after baked "BUD:" at (24.95, 4.81)
const BUD_START_X = 38.5
const BUD_BASELINE = 7.6
const BUD_SIZE = 5.5
const BUD_SIZE_DAY = 6.8

// Product name band above dose box
const NAME_LEFT = 26
const NAME_RIGHT = 88
const NAME_BASELINE = 17.5
const NAME_SIZE_MAX = 9
const NAME_SIZE_MIN = 5.5
const NAME_LINE1_BASELINE = 14.5
const NAME_LINE2_BASELINE = 20.2
const NAME_LINE1_SIZE_MAX = 8
const NAME_LINE2_SIZE_MAX = 6.5
const NAME_LINE2_SIZE_MIN = 4.5

// BATCH: baked at translate(129.07 43.73) rotate(-90)
const BATCH_X = 129.07
const BATCH_BOTTOM = 32 // just above baked BATCH: label end
const BATCH_TOP = 4
const BATCH_SIZE_MAX = 5

const TEMPLATE_CANDIDATES = [
  path.join(process.cwd(), 'public', 'labels', 'clients', 'livbetr', 'livbetr-label-template.png'),
]
const FONT_CANDIDATES = [
  path.join(process.cwd(), 'public', 'fonts', 'labels', 'NeuethingSans-MediumExpanded.ttf'),
  path.join(process.cwd(), 'public', 'fonts', 'labels', 'NeuethingSans-MediumExpanded.otf'),
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

async function loadFontBytes(): Promise<Uint8Array> {
  for (const p of FONT_CANDIDATES) {
    try {
      await access(p)
      return new Uint8Array(await readFile(p))
    } catch {
      /* next */
    }
  }
  return Uint8Array.from(Buffer.from(NEUETHING_SANS_MEDIUM_EXPANDED_B64, 'base64'))
}

function drawLabel(
  page: PDFPage,
  ox: number,
  oy: number,
  template: PDFImage,
  font: PDFFont,
  req: Omit<LivbetrLabelRequest, 'quantity' | 'proofMode'>,
  proofMode: boolean
): void {
  const toX = (svgX: number) => ox + svgX * SX
  const toY = (svgY: number) => oy + LABEL_HEIGHT - svgY * SY

  page.drawImage(template, {
    x: ox,
    y: oy,
    width: LABEL_WIDTH,
    height: LABEL_HEIGHT,
  })

  // BUD date MM/DD/YY — day emphasized in brand teal
  const { month, day, year } = parseBudParts(req.budIsoDate)
  let cursor = BUD_START_X
  const drawBud = (text: string, size: number, color: ReturnType<typeof rgb>) => {
    page.drawText(text, {
      x: toX(cursor),
      y: toY(BUD_BASELINE),
      size: size * SY,
      font,
      color,
    })
    cursor += font.widthOfTextAtSize(text, size * SY) / SX
  }
  drawBud(`${month}/`, BUD_SIZE, COLOR_TEXT)
  drawBud(day, BUD_SIZE_DAY, COLOR_TEAL)
  drawBud(`/${year}`, BUD_SIZE, COLOR_TEXT)

  // Product name
  const nameMaxWidth = (NAME_RIGHT - NAME_LEFT) * SX
  const nameCenterSvg = (NAME_LEFT + NAME_RIGHT) / 2
  const fitSize = (text: string, max: number, min: number) => {
    let size = max
    while (size > min && font.widthOfTextAtSize(text, size * SY) > nameMaxWidth) size -= 0.25
    return size
  }
  const drawName = (text: string, size: number, baseline: number) => {
    const w = font.widthOfTextAtSize(text, size * SY)
    page.drawText(text, {
      x: toX(nameCenterSvg) - w / 2,
      y: toY(baseline),
      size: size * SY,
      font,
      color: COLOR_TEXT,
    })
  }

  const doseNormalized = normalizeDoseLabel(req.dose)
  const fitsOne =
    font.widthOfTextAtSize(req.productName, NAME_SIZE_MAX * SY) <= nameMaxWidth
  const nameLines = fitsOne ? [req.productName] : splitProductNameLines(req.productName)

  if (nameLines.length === 2) {
    const s1 = fitSize(nameLines[0], NAME_LINE1_SIZE_MAX, NAME_SIZE_MIN)
    const s2 = fitSize(nameLines[1], Math.min(NAME_LINE2_SIZE_MAX, s1), NAME_LINE2_SIZE_MIN)
    drawName(nameLines[0], s1, NAME_LINE1_BASELINE)
    drawName(nameLines[1], s2, NAME_LINE2_BASELINE)
  } else {
    drawName(nameLines[0], fitSize(nameLines[0], NAME_SIZE_MAX, NAME_SIZE_MIN), NAME_BASELINE)
  }

  // Dose in black band (single or first of blend "a / b")
  const doseParts = doseNormalized.split(/\s*\/\s*/).map((p) => p.trim()).filter(Boolean)
  const primaryDose = (doseParts[0] ?? doseNormalized).toUpperCase().replace(/\s+/g, '')
  const doseMaxW = (DOSE_BOX_RIGHT - DOSE_BOX_LEFT - 3) * SX
  let doseSize = DOSE_SIZE
  while (doseSize > 3.5 && font.widthOfTextAtSize(primaryDose, doseSize * SY) > doseMaxW) {
    doseSize -= 0.25
  }
  const doseCx = (DOSE_BOX_LEFT + DOSE_BOX_RIGHT) / 2
  const doseW = font.widthOfTextAtSize(primaryDose, doseSize * SY)
  page.drawText(primaryDose, {
    x: toX(doseCx) - doseW / 2,
    y: toY(DOSE_BASELINE),
    size: doseSize * SY,
    font,
    color: COLOR_WHITE,
  })

  // Optional second dose in teal band (covers baked purity when blend)
  if (doseParts.length >= 2) {
    const secondary = doseParts[1].toUpperCase().replace(/\s+/g, '')
    let s2 = DOSE_SIZE * 0.85
    while (s2 > 3 && font.widthOfTextAtSize(secondary, s2 * SY) > doseMaxW) s2 -= 0.25
    const w2 = font.widthOfTextAtSize(secondary, s2 * SY)
    page.drawRectangle({
      x: toX(39.67),
      y: toY(DOSE_BOX_MID + 6.86),
      width: 28.38 * SX,
      height: 6.86 * SY,
      color: COLOR_TEAL,
    })
    page.drawText(secondary, {
      x: toX(doseCx) - w2 / 2,
      y: toY(DOSE_BOX_MID + 4.6),
      size: s2 * SY,
      font,
      color: COLOR_WHITE,
    })
  }

  // Batch number continuing baked BATCH:
  const batchAvail = (BATCH_BOTTOM - BATCH_TOP) * SY
  let batchSize = BATCH_SIZE_MAX
  while (
    batchSize > 3 &&
    font.widthOfTextAtSize(req.batchNumber, batchSize * SY) > batchAvail
  ) {
    batchSize -= 0.2
  }
  page.drawText(req.batchNumber, {
    x: toX(BATCH_X),
    y: toY(BATCH_BOTTOM),
    size: batchSize * SY,
    font,
    color: COLOR_TEAL,
    rotate: degrees(90),
  })

  if (proofMode) {
    page.drawRectangle({
      x: ox + 1,
      y: oy + 1,
      width: LABEL_WIDTH - 2,
      height: LABEL_HEIGHT - 2,
      borderColor: rgb(0.8, 0.2, 0.2),
      borderWidth: 0.5,
    })
  }
}

export async function generateLivbetrLabelsPdf(groups: LivbetrLabelGroup[]): Promise<Buffer> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)

  const template = await doc.embedPng(await loadTemplateBytes())
  let font: PDFFont
  try {
    font = await doc.embedFont(await loadFontBytes(), { subset: true })
  } catch {
    font = await doc.embedFont(StandardFonts.Helvetica)
  }

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
        drawLabel(page, x, y, template, font, group.req, proofMode)
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
