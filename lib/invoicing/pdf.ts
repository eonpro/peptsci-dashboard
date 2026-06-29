/**
 * Professional invoice PDF (Letter) via pdf-lib + Standard-14 fonts — matches
 * the fulfillment packing-slip engine and runs on serverless with no assets.
 *
 * @module lib/invoicing/pdf
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { formatInvoiceNumber } from './core'
import { decorateInvoice, type InvoiceView } from './service'

const PT = 72
const PAGE_W = 8.5 * PT
const PAGE_H = 11 * PT
const MARGIN = 0.75 * PT
const INK = rgb(0.13, 0.12, 0.13)
const MUTED = rgb(0.4, 0.4, 0.44)
const NAVY = rgb(0x05 / 255, 0x07 / 255, 0x22 / 255)
const BLUE = rgb(0x21 / 255, 0x3c / 255, 0xef / 255)
const LINE = rgb(0.82, 0.82, 0.86)
const RED = rgb(0.7, 0.1, 0.1)

type Fonts = { reg: PDFFont; bold: PDFFont }

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

const fmtDate = (d: Date | string | null | undefined): string => {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

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

/** Render an invoice PDF. Accepts a decorated view (preferred) or raw payload. */
export async function generateInvoicePdf(view: InvoiceView): Promise<Buffer> {
  const { invoice, totals } = view
  const doc = await PDFDocument.create()
  const fonts: Fonts = {
    reg: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  }
  const page = doc.addPage([PAGE_W, PAGE_H])
  const top = PAGE_H - MARGIN

  // Header band.
  page.drawText('PeptSci', { x: MARGIN, y: top - 16, size: 20, font: fonts.bold, color: NAVY })
  page.drawText('Research Peptides — Provider Use Only', {
    x: MARGIN,
    y: top - 30,
    size: 9,
    font: fonts.reg,
    color: MUTED,
  })
  const title = 'INVOICE'
  page.drawText(title, {
    x: PAGE_W - MARGIN - fonts.bold.widthOfTextAtSize(title, 22),
    y: top - 18,
    size: 22,
    font: fonts.bold,
    color: INK,
  })
  const num = formatInvoiceNumber(invoice.invoiceNumber)
  page.drawText(num, {
    x: PAGE_W - MARGIN - fonts.reg.widthOfTextAtSize(num, 11),
    y: top - 34,
    size: 11,
    font: fonts.reg,
    color: MUTED,
  })

  let y = top - 56
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: BLUE })
  y -= 22

  // Bill-to (left) + meta (right).
  const billTo = billToLines(invoice.client?.billingAddress, invoice.client?.organizationName ?? '—')
  page.drawText('BILL TO', { x: MARGIN, y, size: 8, font: fonts.bold, color: MUTED })
  let billY = y - 14
  for (const ln of billTo) {
    page.drawText(ln.slice(0, 48), { x: MARGIN, y: billY, size: 10, font: fonts.reg, color: INK })
    billY -= 13
  }

  const metaX = PAGE_W - MARGIN - 220
  let metaY = y
  const meta: Array<[string, string]> = [
    ['Issue date', fmtDate(invoice.issueDate)],
    ['Due date', fmtDate(invoice.dueDate)],
    ['Terms', invoice.paymentTermsDays === 0 ? 'Due on receipt' : `Net ${invoice.paymentTermsDays}`],
    ['Status', invoice.status],
  ]
  if (invoice.periodStart && invoice.periodEnd) {
    meta.splice(1, 0, ['Period', `${fmtDate(invoice.periodStart)} – ${fmtDate(invoice.periodEnd)}`])
  }
  for (const [k, v] of meta) {
    page.drawText(k, { x: metaX, y: metaY, size: 9, font: fonts.bold, color: MUTED })
    page.drawText(v, { x: metaX + 90, y: metaY, size: 9, font: fonts.reg, color: INK })
    metaY -= 14
  }

  y = Math.min(billY, metaY) - 16

  // Line-item table header.
  const cols = { desc: MARGIN, qty: MARGIN + 320, unit: MARGIN + 380, amt: PAGE_W - MARGIN - 70 }
  for (const [label, x, right] of [
    ['DESCRIPTION', cols.desc, false],
    ['QTY', cols.qty, false],
    ['UNIT', cols.unit, false],
    ['AMOUNT', cols.amt, false],
  ] as const) {
    page.drawText(label, { x, y, size: 8, font: fonts.bold, color: MUTED })
  }
  y -= 6
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.75, color: LINE })
  y -= 16

  const drawRow = (pageRef: PDFPage, desc: string, qty: string, unit: string, amt: string) => {
    pageRef.drawText(desc.slice(0, 58), { x: cols.desc, y, size: 10, font: fonts.reg, color: INK })
    pageRef.drawText(qty, { x: cols.qty, y, size: 10, font: fonts.reg, color: INK })
    pageRef.drawText(unit, { x: cols.unit, y, size: 10, font: fonts.reg, color: INK })
    pageRef.drawText(amt, { x: cols.amt, y, size: 10, font: fonts.reg, color: INK })
  }

  let pageRef = page
  for (const li of invoice.lineItems) {
    if (y < MARGIN + 120) {
      pageRef = doc.addPage([PAGE_W, PAGE_H])
      y = PAGE_H - MARGIN - 20
    }
    drawRow(
      pageRef,
      li.description,
      String(li.quantity),
      usd(typeof li.unitPrice === 'number' ? li.unitPrice : li.unitPrice.toNumber()),
      usd(typeof li.amount === 'number' ? li.amount : li.amount.toNumber())
    )
    y -= 16
  }

  // Adjustments as rows.
  for (const adj of invoice.adjustments) {
    const signedLabel =
      adj.kind === 'PERCENT'
        ? `Adjustment (${Number(adj.percent)}%)${adj.reason ? ` — ${adj.reason}` : ''}`
        : `Adjustment${adj.reason ? ` — ${adj.reason}` : ''}`
    const amt =
      adj.kind === 'PERCENT'
        ? (totals.subtotal * Number(adj.percent ?? 0)) / 100
        : Number(adj.amount ?? 0)
    if (y < MARGIN + 120) {
      pageRef = doc.addPage([PAGE_W, PAGE_H])
      y = PAGE_H - MARGIN - 20
    }
    drawRow(pageRef, signedLabel, '', '', usd(amt))
    y -= 16
  }

  // Totals block (right aligned).
  y -= 6
  pageRef.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.75, color: LINE })
  y -= 18

  const totalsRows: Array<[string, string, boolean]> = [
    ['Subtotal', usd(totals.subtotal), false],
  ]
  if (totals.balanceForward) totalsRows.push(['Balance forward', usd(totals.balanceForward), false])
  if (totals.totalAdjustments) totalsRows.push(['Adjustments', usd(totals.totalAdjustments), false])
  totalsRows.push(['Total', usd(totals.grossTotal), true])
  if (totals.totalPayments) totalsRows.push(['Payments', `-${usd(totals.totalPayments)}`, false])

  const labelX = PAGE_W - MARGIN - 220
  const valX = PAGE_W - MARGIN - 70
  for (const [label, val, strong] of totalsRows) {
    const f = strong ? fonts.bold : fonts.reg
    pageRef.drawText(label, { x: labelX, y, size: strong ? 11 : 10, font: f, color: INK })
    pageRef.drawText(val, { x: valX, y, size: strong ? 11 : 10, font: f, color: INK })
    y -= strong ? 18 : 15
  }

  // Amount due highlight.
  y -= 4
  pageRef.drawRectangle({
    x: labelX - 10,
    y: y - 6,
    width: PAGE_W - MARGIN - (labelX - 10),
    height: 24,
    color: rgb(0.96, 0.97, 1),
  })
  const dueColor = totals.amountDue > 0 ? BLUE : rgb(0.1, 0.5, 0.2)
  pageRef.drawText('Amount due', { x: labelX, y: y + 2, size: 12, font: fonts.bold, color: INK })
  pageRef.drawText(usd(totals.amountDue), { x: valX, y: y + 2, size: 12, font: fonts.bold, color: dueColor })
  y -= 30

  if (view.daysPastDue > 0 && totals.amountDue > 0) {
    pageRef.drawText(`PAST DUE by ${view.daysPastDue} day(s)`, {
      x: labelX,
      y,
      size: 9,
      font: fonts.bold,
      color: RED,
    })
    y -= 16
  }

  if (invoice.notes) {
    y -= 6
    pageRef.drawText('Notes', { x: MARGIN, y, size: 8, font: fonts.bold, color: MUTED })
    y -= 13
    pageRef.drawText(invoice.notes.slice(0, 100), { x: MARGIN, y, size: 9, font: fonts.reg, color: INK })
  }

  // Footer.
  pageRef.drawText(
    'Thank you for your business. Remit payment by the due date above. Questions? support@peptsci.com',
    { x: MARGIN, y: MARGIN + 8, size: 8, font: fonts.reg, color: MUTED }
  )

  return Buffer.from(await doc.save())
}

// Re-export so route handlers can build a view from a raw record if needed.
export { decorateInvoice }
