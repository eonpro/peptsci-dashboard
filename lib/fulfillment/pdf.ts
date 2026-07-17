/**
 * Letter-size PDF documents for warehouse pick/pack ops: a pick list (which
 * batches to pull, FIFO) and a customer-facing packing slip (no prices). Both
 * use pdf-lib + Standard-14 fonts to match the server-side label engine and to
 * run on serverless (no external assets required).
 *
 * @module lib/fulfillment/pdf
 */

import path from 'path'
import { access, readFile } from 'fs/promises'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import type { OrderPickList, PackingSlipData } from './service'

const PT = 72
const PAGE_W = 8.5 * PT
const PAGE_H = 11 * PT
const MARGIN = 0.75 * PT
const INK = rgb(0.13, 0.12, 0.13)
const MUTED = rgb(0.4, 0.4, 0.44)
const INDIGO = rgb(0x2b / 255, 0x2c / 255, 0x84 / 255)
const LINE = rgb(0.82, 0.82, 0.86)

type Fonts = { reg: PDFFont; bold: PDFFont }

// Dark-on-light brand mark for white paper (same asset the web UI serves from
// Wix). Traced into the pick-list/packing-slip functions via
// `outputFileTracingIncludes` in next.config.mjs; when unavailable the header
// falls back to the indigo "PeptSci" wordmark.
const LOGO_CANDIDATES = [
  path.join(process.cwd(), 'public', 'brand', 'peptsci-logo-dark.png'),
  path.join(process.cwd(), 'assets', 'brand', 'peptsci-logo-dark.png'),
]

async function embedBrandLogo(doc: PDFDocument): Promise<PDFImage | null> {
  for (const candidate of LOGO_CANDIDATES) {
    try {
      await access(candidate)
      return await doc.embedPng(await readFile(candidate))
    } catch {
      // try next / fall through to the text wordmark
    }
  }
  return null
}

/**
 * Standard-14 PDF fonts only support WinAnsi (CP-1252). Any glyph outside it
 * (™, curly quotes, accented letters, emoji, CJK) makes pdf-lib's drawText
 * throw and 500s the whole document. Map the common typographic characters to
 * ASCII equivalents and replace anything still unrepresentable with '?', so a
 * product/customer name with unusual characters can never crash label/slip
 * generation.
 */
function S(input: string | null | undefined): string {
  if (!input) return ''
  const mapped = input
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u2122/g, '(TM)')
    .replace(/[\u00AE]/g, '(R)')
    .replace(/\u00A0/g, ' ')
  // Drop anything outside the printable WinAnsi range (approximation: keep
  // ASCII + Latin-1 supplement) and fall back to '?' so widths stay valid.
  // eslint-disable-next-line no-control-regex
  return mapped.replace(/[^\u0000-\u00FF]/g, '?')
}

function formatAddress(addr: unknown): string[] {
  if (!addr || typeof addr !== 'object') return []
  const a = addr as Record<string, unknown>
  const str = (k: string) => (typeof a[k] === 'string' ? (a[k] as string) : '')
  const name = str('name') || str('contactName')
  const line1 = str('line1') || str('address1') || str('street')
  const line2 = str('line2') || str('address2')
  const city = str('city')
  const state = str('state')
  const zip = str('zip') || str('postalCode')
  const cityState = [city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  return [name, line1, line2, cityState, str('country')].filter((s) => s.trim().length > 0)
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

/** Draw the shared PeptSci document header; returns the new cursor Y. */
function drawHeader(
  page: PDFPage,
  fonts: Fonts,
  logo: PDFImage | null,
  title: string,
  subtitle: string
): number {
  const top = PAGE_H - MARGIN
  if (logo) {
    const logoH = 24
    const logoW = (logo.width / logo.height) * logoH
    page.drawImage(logo, { x: MARGIN, y: top - logoH - 2, width: logoW, height: logoH })
  } else {
    page.drawText('PeptSci', { x: MARGIN, y: top - 14, size: 18, font: fonts.bold, color: INDIGO })
  }
  page.drawText(title, {
    x: PAGE_W - MARGIN - fonts.bold.widthOfTextAtSize(title, 16),
    y: top - 13,
    size: 16,
    font: fonts.bold,
    color: INK,
  })
  page.drawText(subtitle, {
    x: PAGE_W - MARGIN - fonts.reg.widthOfTextAtSize(subtitle, 9),
    y: top - 26,
    size: 9,
    font: fonts.reg,
    color: MUTED,
  })
  const ruleY = top - 34
  page.drawLine({
    start: { x: MARGIN, y: ruleY },
    end: { x: PAGE_W - MARGIN, y: ruleY },
    thickness: 1,
    color: INDIGO,
  })
  return ruleY - 22
}

async function makeFonts(doc: PDFDocument): Promise<Fonts> {
  return {
    reg: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  }
}

/** Pick list: per-line batch draws (FIFO) the picker pulls from the shelf. */
export async function generatePickListPdf(pl: OrderPickList): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const fonts = await makeFonts(doc)
  const logo = await embedBrandLogo(doc)
  const page = doc.addPage([PAGE_W, PAGE_H])
  let y = drawHeader(page, fonts, logo, 'PICK LIST', `Order #${pl.orderNumber}`)

  page.drawText(S(`Client: ${pl.clientName ?? '—'}`), { x: MARGIN, y, size: 10, font: fonts.reg, color: INK })
  page.drawText(`Ordered: ${fmtDate(pl.createdAt)}`, {
    x: MARGIN + 280,
    y,
    size: 10,
    font: fonts.reg,
    color: INK,
  })
  y -= 16
  page.drawText(`Total units to pick: ${pl.totalUnits}`, {
    x: MARGIN,
    y,
    size: 10,
    font: fonts.bold,
    color: INK,
  })
  if (pl.totalShortfall > 0) {
    const warn = `SHORTFALL: ${pl.totalShortfall} unit(s) unallocated`
    page.drawText(warn, {
      x: MARGIN + 280,
      y,
      size: 10,
      font: fonts.bold,
      color: rgb(0.7, 0.1, 0.1),
    })
  }
  y -= 24

  // Column header row.
  const cols = { product: MARGIN, dose: MARGIN + 200, qty: MARGIN + 270, batch: MARGIN + 320 }
  const headerY = y
  for (const [label, x] of [
    ['PRODUCT', cols.product],
    ['DOSE', cols.dose],
    ['QTY', cols.qty],
    ['BATCH (BUD) × QTY — FIFO', cols.batch],
  ] as const) {
    page.drawText(label, { x, y: headerY, size: 8, font: fonts.bold, color: MUTED })
  }
  y -= 6
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 0.75,
    color: LINE,
  })
  y -= 16

  for (const line of pl.lines) {
    if (y < MARGIN + 40) {
      y = drawHeader(doc.addPage([PAGE_W, PAGE_H]), fonts, logo, 'PICK LIST', `Order #${pl.orderNumber}`)
    }
    const pageRef = doc.getPages()[doc.getPageCount() - 1]
    pageRef.drawText(S(line.productName).slice(0, 40), {
      x: cols.product,
      y,
      size: 10,
      font: fonts.bold,
      color: INK,
    })
    pageRef.drawText(S(line.dose) || '—', { x: cols.dose, y, size: 10, font: fonts.reg, color: INK })
    pageRef.drawText(String(line.quantityNeeded), {
      x: cols.qty,
      y,
      size: 10,
      font: fonts.bold,
      color: INK,
    })
    const drawText =
      line.draws.length > 0
        ? line.draws.map((d) => `${d.batchNumber} (${d.bud}) x${d.qty}`).join('   ')
        : '- no stock -'
    pageRef.drawText(S(drawText).slice(0, 70), {
      x: cols.batch,
      y,
      size: 9,
      font: fonts.reg,
      color: line.shortfall > 0 ? rgb(0.7, 0.1, 0.1) : INK,
    })
    if (line.shortfall > 0) {
      y -= 12
      pageRef.drawText(`short ${line.shortfall}`, {
        x: cols.batch,
        y,
        size: 8,
        font: fonts.bold,
        color: rgb(0.7, 0.1, 0.1),
      })
    }
    y -= 20
  }

  const last = doc.getPages()[doc.getPageCount() - 1]
  last.drawText('Picked by: ____________________      Date: ____________', {
    x: MARGIN,
    y: MARGIN + 8,
    size: 9,
    font: fonts.reg,
    color: MUTED,
  })

  return Buffer.from(await doc.save())
}

/** Packing slip: customer-facing contents list (quantities only, no prices). */
export async function generatePackingSlipPdf(slip: PackingSlipData): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const fonts = await makeFonts(doc)
  const logo = await embedBrandLogo(doc)
  const page = doc.addPage([PAGE_W, PAGE_H])
  let y = drawHeader(page, fonts, logo, 'PACKING SLIP', `Order #${slip.orderNumber}`)

  // Ship-to block.
  page.drawText('SHIP TO', { x: MARGIN, y, size: 8, font: fonts.bold, color: MUTED })
  y -= 14
  const addrLines = formatAddress(slip.shippingAddress)
  const shipTo = addrLines.length > 0 ? addrLines : [slip.client?.organizationName ?? '—']
  for (const ln of shipTo) {
    page.drawText(S(ln).slice(0, 60), { x: MARGIN, y, size: 10, font: fonts.reg, color: INK })
    y -= 13
  }

  // Order meta (right column, aligned to the ship-to top).
  const metaX = PAGE_W - MARGIN - 200
  let metaY = page.getHeight() - MARGIN - 56
  const meta: Array<[string, string]> = [
    ['Order', `#${slip.orderNumber}`],
    ['Date', fmtDate(slip.createdAt)],
    ['Account', slip.client?.organizationName ?? '—'],
    ...(slip.carrier ? ([['Carrier', slip.carrier]] as Array<[string, string]>) : []),
    ...(slip.trackingNumber
      ? ([['Tracking', slip.trackingNumber]] as Array<[string, string]>)
      : []),
  ]
  for (const [k, v] of meta) {
    page.drawText(k, { x: metaX, y: metaY, size: 9, font: fonts.bold, color: MUTED })
    page.drawText(S(v).slice(0, 28), { x: metaX + 60, y: metaY, size: 9, font: fonts.reg, color: INK })
    metaY -= 13
  }

  y = Math.min(y, metaY) - 14

  // Items table.
  const cols = { product: MARGIN, dose: MARGIN + 250, sku: MARGIN + 340, qty: PAGE_W - MARGIN - 40 }
  for (const [label, x] of [
    ['PRODUCT', cols.product],
    ['DOSE', cols.dose],
    ['SKU', cols.sku],
    ['QTY', cols.qty],
  ] as const) {
    page.drawText(label, { x, y, size: 8, font: fonts.bold, color: MUTED })
  }
  y -= 6
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 0.75,
    color: LINE,
  })
  y -= 16

  for (const ln of slip.lines) {
    if (y < MARGIN + 40) {
      y = drawHeader(doc.addPage([PAGE_W, PAGE_H]), fonts, logo, 'PACKING SLIP', `Order #${slip.orderNumber}`)
    }
    const pageRef = doc.getPages()[doc.getPageCount() - 1]
    pageRef.drawText(S(ln.productName).slice(0, 46), {
      x: cols.product,
      y,
      size: 10,
      font: fonts.reg,
      color: INK,
    })
    pageRef.drawText(S(ln.dose) || '—', { x: cols.dose, y, size: 10, font: fonts.reg, color: INK })
    pageRef.drawText(S(ln.sku) || '—', { x: cols.sku, y, size: 9, font: fonts.reg, color: MUTED })
    pageRef.drawText(String(ln.quantity), { x: cols.qty, y, size: 10, font: fonts.bold, color: INK })
    y -= 18
  }

  const last = doc.getPages()[doc.getPageCount() - 1]
  y -= 4
  last.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 0.75,
    color: LINE,
  })
  y -= 16
  last.drawText(`Total units: ${slip.totalUnits}`, {
    x: cols.product,
    y,
    size: 10,
    font: fonts.bold,
    color: INK,
  })

  last.drawText('Research Use Only — Not for human or animal consumption.', {
    x: MARGIN,
    y: MARGIN + 8,
    size: 8,
    font: fonts.reg,
    color: MUTED,
  })

  return Buffer.from(await doc.save())
}
