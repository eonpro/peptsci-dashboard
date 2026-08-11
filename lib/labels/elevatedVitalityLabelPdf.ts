/**
 * Elevated Vitality white-label vial labels (OL4891LP 2.0" × 0.75").
 *
 * Static brand artwork comes from the client SVG template; overlays:
 *   - Product name(s) @ 9pt Inter ExtraBold Italic, centered between wordmark
 *     and black card (two compounds → two lines)
 *   - Dose in the black card (white), e.g. 10MG or 10MG/10MG
 *   - BATCH# / EXP values on the right rail (continuing baked labels)
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
  EV_TEMPLATE_PNG_B64,
  INTER_EXTRABOLD_ITALIC_B64,
  INTER_BLACK_B64,
} from './elevatedVitalityEmbeddedAssets'
import { normalizeDoseLabel } from './peptsciLabelPdf'
import { OL4891LP, labelsPerSheet, planLabelSheets } from './sheet-layout'
import { embedLabelFont } from './embed-font'

export { ELEVATED_VITALITY_BRAND_KEY } from './brandKeys'

const PT_PER_INCH = 72
const SHEET_WIDTH = 8.5 * PT_PER_INCH
const SHEET_HEIGHT = 11 * PT_PER_INCH

// OL4891LP label size. Sheet margins and pitches live in ./sheet-layout, which
// owns slot placement.
const LABEL_WIDTH = 2.0 * PT_PER_INCH // 144
const LABEL_HEIGHT = 0.75 * PT_PER_INCH // 54

const COLOR_BLACK = rgb(0x01 / 255, 0x01 / 255, 0x01 / 255)
const COLOR_WHITE = rgb(1, 1, 1)

const CARD = { x: 52.71, y: 35.46, w: 29.73, h: 9.07 }
const CARD_CX = CARD.x + CARD.w / 2
const LOGO_BOTTOM = 20.5
const CARD_TOP = CARD.y
// Product name sizing. The name is the hero element, so it gets the whole clear
// band between the "vitality" script and the black dose card, and a width budget
// wider than the "elevated" wordmark (42.1pt of centre column) — it may sit over
// the grey swoosh, as the wordmark already does, but stays clear of the trident
// block on the left (solid artwork ends at x=28.4) and the right rail (x=120).
const NAME_MAX_SIZE = 11
const NAME_MAX_WIDTH = 56
/** Vertical gap between the two lines of a blend name. */
const NAME_LINE_GAP = 1.4
/** Breathing room kept at the top and bottom of the name band. */
const NAME_BAND_PAD = 0.6
const CAP_RATIO = 0.74
const DOSE_SIZE = 4.2

const RAIL_X = 132.89
const BATCH_ORIGIN_Y = 49.81
const EXP_ORIGIN_Y = 24.35
const RAIL_LABEL_SIZE = 2.67
const BATCH_LABEL_WIDTH = 12.2
const EXP_LABEL_WIDTH = 5.8

const TEMPLATE_CANDIDATES = [
  path.join(
    process.cwd(),
    'public',
    'labels',
    'clients',
    'elevated-vitality',
    'elevated-vitality-label-template.png'
  ),
]

const FONT_DIR = path.join(process.cwd(), 'public', 'fonts', 'labels')
const INTER_ITALIC_PATHS = [path.join(FONT_DIR, 'Inter-ExtraBoldItalic.ttf')]
const INTER_BLACK_PATHS = [path.join(FONT_DIR, 'Inter-Black.ttf')]

/** Slots on one OL4891LP sheet (36). */
export const ELEVATED_VITALITY_LABEL_SHEET_MAX = labelsPerSheet(OL4891LP)

export type ElevatedVitalityLabelRequest = {
  productName: string
  dose: string
  batchNumber: string
  budIsoDate: string
  quantity: number
  proofMode?: boolean
}

export type ElevatedVitalityLabelGroup = {
  req: Omit<ElevatedVitalityLabelRequest, 'quantity' | 'proofMode'>
  quantity: number
  proofMode?: boolean
}

/** Split blend names into two lines without a leading "and". */
export function splitElevatedVitalityNameLines(name: string): string[] {
  const trimmed = name.trim().replace(/\s+/g, ' ')
  const slashParts = trimmed
    .replace(/\s+blend$/i, '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
  if (slashParts.length === 2) return [slashParts[0], slashParts[1]]
  const byAnd = /^(.+?)\s+&\s+(.+)$/i.exec(trimmed)
  if (byAnd) return [byAnd[1], byAnd[2]]
  const byAndWord = /^(.+?)\s+and\s+(.+)$/i.exec(trimmed)
  if (byAndWord) return [byAndWord[1], byAndWord[2]]
  return [trimmed]
}

/** Format dose for the black card; two-line blends get dose/dose when needed. */
export function formatElevatedVitalityDose(dose: string, nameLines: string[]): string {
  const normalized = normalizeDoseLabel(dose).replace(/\s+/g, '').toUpperCase()
  if (nameLines.length < 2) return normalized
  if (normalized.includes('/')) return normalized
  return `${normalized}/${normalized}`
}

/** EXP rail value — MM/DD/YY (two-digit year so it fits the white rail box). */
export function parseBudUs(isoOrUs: string): string {
  const v = isoOrUs.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1].slice(-2)}`
  const us4 = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(v)
  if (us4) return `${us4[1]}/${us4[2]}/${us4[3].slice(-2)}`
  const us2 = /^(\d{2})[-/](\d{2})[-/](\d{2})$/.exec(v)
  if (us2) return `${us2[1]}/${us2[2]}/${us2[3]}`
  return v
}

async function loadTemplateBytes(): Promise<Uint8Array> {
  for (const candidate of TEMPLATE_CANDIDATES) {
    try {
      await access(candidate)
      return new Uint8Array(await readFile(candidate))
    } catch {
      /* try next */
    }
  }
  return Uint8Array.from(Buffer.from(EV_TEMPLATE_PNG_B64, 'base64'))
}

async function loadFontBytes(paths: string[], embeddedB64: string): Promise<Uint8Array> {
  for (const p of paths) {
    try {
      await access(p)
      return new Uint8Array(await readFile(p))
    } catch {
      /* try next */
    }
  }
  return Uint8Array.from(Buffer.from(embeddedB64, 'base64'))
}

function fitTextWidth(font: PDFFont, text: string, size: number, maxWidth: number): number {
  let s = size
  while (s > 3.5 && font.widthOfTextAtSize(text, s) > maxWidth) s -= 0.25
  return s
}

/**
 * One size shared by every line of the product name, as large as the artwork
 * allows: capped by `NAME_MAX_SIZE`, by the width budget, and — for a two-line
 * blend — by the height of the band, so the lines can never collide.
 */
export function fitNameSize(font: PDFFont, lines: string[]): number {
  const byWidth = Math.min(
    ...lines.map((line) => fitTextWidth(font, line, NAME_MAX_SIZE, NAME_MAX_WIDTH))
  )
  const band = CARD_TOP - LOGO_BOTTOM - 2 * NAME_BAND_PAD
  const byHeight = (band - (lines.length - 1) * NAME_LINE_GAP) / (lines.length * CAP_RATIO)
  return Math.min(byWidth, byHeight)
}

function drawLabel(
  page: PDFPage,
  originX: number,
  originY: number,
  template: PDFImage,
  italic: PDFFont,
  black: PDFFont,
  req: Omit<ElevatedVitalityLabelRequest, 'quantity' | 'proofMode'>,
  proofMode: boolean
): void {
  const ox = originX
  const oy = originY

  page.drawImage(template, {
    x: ox,
    y: oy,
    width: LABEL_WIDTH,
    height: LABEL_HEIGHT,
  })

  const nameLines = splitElevatedVitalityNameLines(req.productName).map((l) => l.toUpperCase())
  const dose = formatElevatedVitalityDose(req.dose, nameLines)
  const nameSize = fitNameSize(italic, nameLines)
  const capHeight = nameSize * CAP_RATIO
  const leading = capHeight + NAME_LINE_GAP
  const blockHeight = nameLines.length * capHeight + (nameLines.length - 1) * NAME_LINE_GAP
  const pad = Math.max(0, (CARD_TOP - LOGO_BOTTOM - blockHeight) / 2)
  const firstBaselineSvg = LOGO_BOTTOM + pad + capHeight

  for (let i = 0; i < nameLines.length; i += 1) {
    const line = nameLines[i]
    const baselineSvg = firstBaselineSvg + i * leading
    const textWidth = italic.widthOfTextAtSize(line, nameSize)
    page.drawText(line, {
      x: ox + CARD_CX - textWidth / 2,
      y: oy + (LABEL_HEIGHT - baselineSvg),
      size: nameSize,
      font: italic,
      color: COLOR_BLACK,
    })
  }

  const doseSize = fitTextWidth(italic, dose, DOSE_SIZE, CARD.w - 2)
  const doseBaselineSvg = CARD.y + CARD.h / 2 + doseSize * 0.35
  const doseWidth = italic.widthOfTextAtSize(dose, doseSize)
  page.drawText(dose, {
    x: ox + CARD_CX - doseWidth / 2,
    y: oy + (LABEL_HEIGHT - doseBaselineSvg),
    size: doseSize,
    font: italic,
    color: COLOR_WHITE,
  })

  // Rail values continue after baked BATCH#: / EXP: labels (SVG rotate -90).
  // pdf-lib degrees(90) reads bottom→top; anchor at the end of each baked label.
  const drawRailValue = (value: string, originSvgY: number, labelWidth: number) => {
    const startSvgY = originSvgY - labelWidth - 1.2
    page.drawText(value, {
      x: ox + RAIL_X,
      y: oy + (LABEL_HEIGHT - startSvgY),
      size: RAIL_LABEL_SIZE,
      font: black,
      color: COLOR_BLACK,
      rotate: degrees(90),
    })
  }
  drawRailValue(req.batchNumber.trim(), BATCH_ORIGIN_Y, BATCH_LABEL_WIDTH)
  drawRailValue(parseBudUs(req.budIsoDate), EXP_ORIGIN_Y, EXP_LABEL_WIDTH)

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

export async function generateElevatedVitalityLabelsPdf(
  groups: ElevatedVitalityLabelGroup[]
): Promise<Buffer> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)

  const { pageCount, placements } = planLabelSheets(
    groups.map((group) => ({
      req: { label: group.req, proofMode: Boolean(group.proofMode) },
      quantity: group.quantity,
    }))
  )

  // Nothing to print (e.g. no allocatable batches) still yields one blank
  // sheet. Returning before embedding fonts also avoids a fontkit crash when
  // subsetting a font no glyph was ever drawn with.
  if (placements.length === 0) {
    doc.addPage([SHEET_WIDTH, SHEET_HEIGHT])
    return Buffer.from(await doc.save())
  }

  const templateBytes = await loadTemplateBytes()
  const template = await doc.embedPng(templateBytes)
  const italicBytes = await loadFontBytes(INTER_ITALIC_PATHS, INTER_EXTRABOLD_ITALIC_B64)
  const blackBytes = await loadFontBytes(INTER_BLACK_PATHS, INTER_BLACK_B64)
  let italic: PDFFont
  let black: PDFFont
  try {
    italic = await embedLabelFont(doc, italicBytes)
    black = await embedLabelFont(doc, blackBytes)
  } catch {
    italic = await doc.embedFont(StandardFonts.HelveticaBoldOblique)
    black = await doc.embedFont(StandardFonts.HelveticaBold)
  }

  const pages = Array.from({ length: pageCount }, () => doc.addPage([SHEET_WIDTH, SHEET_HEIGHT]))
  for (const { pageIndex, x, y, req } of placements) {
    drawLabel(pages[pageIndex], x, y, template, italic, black, req.label, req.proofMode)
  }

  const bytes = await doc.save()
  return Buffer.from(bytes)
}

export async function generateElevatedVitalityLabelSheetPdf(
  input: ElevatedVitalityLabelRequest
): Promise<Buffer> {
  return generateElevatedVitalityLabelsPdf([
    {
      req: {
        productName: input.productName,
        dose: input.dose,
        batchNumber: input.batchNumber,
        budIsoDate: input.budIsoDate,
      },
      quantity: input.quantity,
      proofMode: input.proofMode,
    },
  ])
}
