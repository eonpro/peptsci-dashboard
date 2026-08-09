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

export { ELEVATED_VITALITY_BRAND_KEY } from './brandKeys'

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

const COLOR_BLACK = rgb(0x01 / 255, 0x01 / 255, 0x01 / 255)
const COLOR_WHITE = rgb(1, 1, 1)

const CARD = { x: 52.71, y: 35.46, w: 29.73, h: 9.07 }
const CARD_CX = CARD.x + CARD.w / 2
const LOGO_BOTTOM = 20.5
const CARD_TOP = CARD.y
const NAME_SIZE = 9
const NAME_LEADING = 5.5
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

export const ELEVATED_VITALITY_LABEL_SHEET_MAX = MAX_LABELS

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
  const blockSpan = nameLines.length === 1 ? 0 : (nameLines.length - 1) * NAME_LEADING
  const visualHeight = NAME_SIZE * CAP_RATIO + blockSpan
  const pad = Math.max(0, (CARD_TOP - LOGO_BOTTOM - visualHeight) / 2)
  const firstBaselineSvg = LOGO_BOTTOM + pad + NAME_SIZE * CAP_RATIO
  const maxNameWidth = CARD.w + 8

  for (let i = 0; i < nameLines.length; i += 1) {
    const line = nameLines[i]
    const size = fitTextWidth(italic, line, NAME_SIZE, maxNameWidth)
    const baselineSvg = firstBaselineSvg + i * NAME_LEADING
    const textWidth = italic.widthOfTextAtSize(line, size)
    page.drawText(line, {
      x: ox + CARD_CX - textWidth / 2,
      y: oy + (LABEL_HEIGHT - baselineSvg),
      size,
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

  const templateBytes = await loadTemplateBytes()
  const template = await doc.embedPng(templateBytes)
  const italicBytes = await loadFontBytes(INTER_ITALIC_PATHS, INTER_EXTRABOLD_ITALIC_B64)
  const blackBytes = await loadFontBytes(INTER_BLACK_PATHS, INTER_BLACK_B64)
  let italic: PDFFont
  let black: PDFFont
  try {
    italic = await doc.embedFont(italicBytes, { subset: true })
    black = await doc.embedFont(blackBytes, { subset: true })
  } catch {
    italic = await doc.embedFont(StandardFonts.HelveticaBoldOblique)
    black = await doc.embedFont(StandardFonts.HelveticaBold)
  }

  let drewAnything = false
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
        drawLabel(page, x, y, template, italic, black, group.req, proofMode)
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
