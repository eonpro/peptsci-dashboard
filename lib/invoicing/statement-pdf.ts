/**
 * Account statement PDF (Letter) via pdf-lib + Standard-14 fonts — no external
 * assets, serverless-safe (same engine as the invoice/packing-slip PDFs).
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { StatementData } from './statement'

const PT = 72
const PAGE_W = 8.5 * PT
const PAGE_H = 11 * PT
const MARGIN = 0.75 * PT
const INK = rgb(0.13, 0.12, 0.13)
const MUTED = rgb(0.4, 0.4, 0.44)
const NAVY = rgb(0x05 / 255, 0x07 / 255, 0x22 / 255)
const LINE = rgb(0.82, 0.82, 0.86)
const RED = rgb(0.7, 0.1, 0.1)

type Fonts = { reg: PDFFont; bold: PDFFont }

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })

function billToLines(addr: unknown, fallbackName: string): string[] {
  const out: string[] = [fallbackName]
  if (addr && typeof addr === 'object') {
    const a = addr as Record<string, unknown>
    const s = (k: string) => (typeof a[k] === 'string' ? (a[k] as string) : '')
    const l1 = s('line1') || s('address1') || s('street')
    const l2 = s('line2') || s('address2')
    const cityState = [s('city'), [s('state'), s('zip') || s('postalCode')].filter(Boolean).join(' ')]
      .filter(Boolean)
      .join(', ')
    for (const ln of [l1, l2, cityState]) if (ln.trim()) out.push(ln)
  }
  return out
}

export async function generateStatementPdf(data: StatementData): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const fonts: Fonts = {
    reg: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  }

  let page = doc.addPage([PAGE_W, PAGE_H])
  let y = PAGE_H - MARGIN

  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H])
    y = PAGE_H - MARGIN
  }
  const ensure = (needed: number) => {
    if (y - needed < MARGIN) newPage()
  }
  const text = (
    t: string,
    x: number,
    size = 9,
    font: PDFFont = fonts.reg,
    color = INK,
    pg: PDFPage = page
  ) => pg.drawText(t, { x, y, size, font, color })
  const rightText = (t: string, rightX: number, size = 9, font: PDFFont = fonts.reg, color = INK) =>
    page.drawText(t, { x: rightX - font.widthOfTextAtSize(t, size), y, size, font, color })
  const hr = () => {
    page.drawLine({
      start: { x: MARGIN, y: y + 3 },
      end: { x: PAGE_W - MARGIN, y: y + 3 },
      thickness: 0.6,
      color: LINE,
    })
  }

  // ── Header ──
  page.drawText('PeptSci', { x: MARGIN, y: y - 16, size: 20, font: fonts.bold, color: NAVY })
  page.drawText('Research Peptides — Provider Use Only', {
    x: MARGIN,
    y: y - 30,
    size: 9,
    font: fonts.reg,
    color: MUTED,
  })
  const title = 'STATEMENT'
  page.drawText(title, {
    x: PAGE_W - MARGIN - fonts.bold.widthOfTextAtSize(title, 22),
    y: y - 18,
    size: 22,
    font: fonts.bold,
    color: INK,
  })
  const period = `${fmtDate(data.periodStart)} — ${fmtDate(new Date(data.periodEnd.getTime() - 1))}`
  page.drawText(period, {
    x: PAGE_W - MARGIN - fonts.reg.widthOfTextAtSize(period, 10),
    y: y - 34,
    size: 10,
    font: fonts.reg,
    color: MUTED,
  })
  y -= 60

  // ── Bill-to ──
  text('STATEMENT FOR', MARGIN, 8, fonts.bold, MUTED)
  y -= 13
  for (const ln of billToLines(data.client.billingAddress, data.client.organizationName)) {
    text(ln, MARGIN, 10)
    y -= 13
  }
  y -= 6

  // ── Balances summary ──
  const summary: Array<[string, string, PDFFont]> = [
    ['Opening balance', usd(data.openingBalance), fonts.reg],
    ['Activity this period', usd(data.closingBalance - data.openingBalance), fonts.reg],
    ['Closing balance', usd(data.closingBalance), fonts.bold],
  ]
  for (const [label, value, font] of summary) {
    text(label, MARGIN, 10, font)
    rightText(value, PAGE_W - MARGIN, 10, font)
    y -= 14
  }
  y -= 10

  // ── Activity table ──
  text('ACTIVITY', MARGIN, 8, fonts.bold, MUTED)
  y -= 14
  hr()
  y -= 12
  const COL_DATE = MARGIN
  const COL_DESC = MARGIN + 80
  const COL_AMT = PAGE_W - MARGIN - 90
  const COL_BAL = PAGE_W - MARGIN
  text('Date', COL_DATE, 8, fonts.bold, MUTED)
  text('Description', COL_DESC, 8, fonts.bold, MUTED)
  rightText('Amount', COL_AMT, 8, fonts.bold, MUTED)
  rightText('Balance', COL_BAL, 8, fonts.bold, MUTED)
  y -= 12

  if (data.lines.length === 0) {
    text('No activity this period.', COL_DATE, 9, fonts.reg, MUTED)
    y -= 14
  }
  for (const ln of data.lines) {
    ensure(16)
    text(fmtDate(ln.date), COL_DATE, 9)
    text(ln.description.slice(0, 70), COL_DESC, 9)
    rightText(`${ln.amount < 0 ? '-' : ''}${usd(Math.abs(ln.amount))}`, COL_AMT, 9, fonts.reg, ln.amount < 0 ? MUTED : INK)
    rightText(usd(ln.balance), COL_BAL, 9)
    y -= 14
  }
  y -= 8

  // ── Open invoices ──
  if (data.openInvoices.length > 0) {
    ensure(60)
    text('OPEN INVOICES', MARGIN, 8, fonts.bold, MUTED)
    y -= 14
    hr()
    y -= 12
    text('Invoice', MARGIN, 8, fonts.bold, MUTED)
    text('Issued', MARGIN + 90, 8, fonts.bold, MUTED)
    text('Due', MARGIN + 170, 8, fonts.bold, MUTED)
    rightText('Amount due', PAGE_W - MARGIN, 8, fonts.bold, MUTED)
    y -= 12
    for (const inv of data.openInvoices) {
      ensure(16)
      const overdue = inv.daysPastDue > 0
      text(inv.number, MARGIN, 9, fonts.reg, overdue ? RED : INK)
      text(fmtDate(inv.issueDate), MARGIN + 90, 9)
      text(inv.dueDate ? fmtDate(inv.dueDate) : '—', MARGIN + 170, 9, fonts.reg, overdue ? RED : INK)
      rightText(usd(inv.amountDue), PAGE_W - MARGIN, 9, fonts.reg, overdue ? RED : INK)
      y -= 14
    }
    y -= 8
  }

  // ── Aging summary ──
  ensure(50)
  text('AGING SUMMARY', MARGIN, 8, fonts.bold, MUTED)
  y -= 14
  hr()
  y -= 12
  const buckets: Array<[string, number]> = [
    ['Current', data.aging.current],
    ['1–30 days', data.aging.net30],
    ['31–60 days', data.aging.net60],
    ['61–90 days', data.aging.net90],
    ['Over 90', data.aging.over90],
  ]
  const colW = (PAGE_W - 2 * MARGIN) / buckets.length
  buckets.forEach(([label], i) => {
    page.drawText(label, { x: MARGIN + i * colW, y, size: 8, font: fonts.bold, color: MUTED })
  })
  y -= 12
  buckets.forEach(([, amount], i) => {
    page.drawText(usd(amount), {
      x: MARGIN + i * colW,
      y,
      size: 10,
      font: fonts.reg,
      color: amount > 0 && i >= 2 ? RED : INK,
    })
  })
  y -= 24

  text('Questions about this statement? Contact billing@peptsci.com.', MARGIN, 8, fonts.reg, MUTED)

  const bytes = await doc.save()
  return Buffer.from(bytes)
}
