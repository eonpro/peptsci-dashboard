import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { generateInvoicePdf } from '../invoicing/pdf.ts'
import type { InvoiceView } from '../invoicing/service.ts'
import { computeInvoiceTotals } from '../invoicing/core.ts'
import { pdfShownStrings } from './pdf-probe.ts'

/**
 * Invoice lines for orders are persisted as "Order #N — YYYY-MM-DD" with no hint
 * of who the order shipped to, so a clinic that ships to its patients could not
 * tell the lines apart when itemizing. The patient is added at render time.
 */
type LineFixture = {
  description: string
  orderId: string | null
  amount: number
}

function view(lines: LineFixture[], shipToByOrderId?: Record<string, string>): InvoiceView {
  const lineItems = lines.map((l, i) => ({
    id: `li_${i}`,
    invoiceId: 'inv_1',
    orderId: l.orderId,
    variantId: null,
    description: l.description,
    quantity: 1,
    unitPrice: l.amount,
    amount: l.amount,
    createdAt: new Date('2026-09-01T00:00:00Z'),
  }))
  const totals = computeInvoiceTotals({
    lineItems: lineItems.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, amount: l.amount })),
  })
  return {
    invoice: {
      id: 'inv_1',
      invoiceNumber: 57,
      status: 'OPEN',
      issueDate: new Date('2026-09-01T00:00:00Z'),
      dueDate: new Date('2026-10-01T00:00:00Z'),
      paymentTermsDays: 30,
      periodStart: null,
      periodEnd: null,
      notes: null,
      client: {
        id: 'cl_1',
        organizationName: 'InCare Now',
        billingAddress: { address1: '1 Clinic Way', city: 'Tampa', state: 'FL', zip: '33602' },
      },
      lineItems,
      adjustments: [],
      payments: [],
    },
    totals,
    aging: 'current',
    daysPastDue: 0,
    ...(shipToByOrderId ? { shipToByOrderId } : {}),
  } as unknown as InvoiceView
}

async function shown(v: InvoiceView): Promise<string[]> {
  return pdfShownStrings(await generateInvoicePdf(v))
}

describe('invoice PDF ship-to-patient lines', () => {
  const lines: LineFixture[] = [
    { description: 'Order #1042 — 2026-09-01', orderId: 'ord_1', amount: 120 },
    { description: 'Order #1043 — 2026-09-02', orderId: 'ord_2', amount: 80 },
    { description: 'Consulting fee', orderId: null, amount: 50 },
  ]

  test('names the patient under each order line that shipped to one', async () => {
    const text = await shown(view(lines, { ord_1: 'Jane Doe', ord_2: 'Ada Lovelace' }))
    // The persisted "Order #N — date" text (em dash included) is drawn unchanged.
    assert.ok(text.includes('Order #1042 \u2014 2026-09-01'))
    assert.ok(text.includes('Ship to patient: Jane Doe'))
    assert.ok(text.includes('Ship to patient: Ada Lovelace'))
  })

  test('draws each patient line directly after its own order line', async () => {
    const text = await shown(view(lines, { ord_1: 'Jane Doe', ord_2: 'Ada Lovelace' }))
    const at = (needle: (t: string) => boolean) => text.findIndex(needle)
    const order1 = at((t) => t.startsWith('Order #1042'))
    const order2 = at((t) => t.startsWith('Order #1043'))
    assert.ok(order1 >= 0 && order2 > order1)
    assert.ok(at((t) => t === 'Ship to patient: Jane Doe') > order1)
    assert.ok(at((t) => t === 'Ship to patient: Jane Doe') < order2)
    assert.ok(at((t) => t === 'Ship to patient: Ada Lovelace') > order2)
  })

  test('adds nothing for practice-shipped orders or manual lines', async () => {
    const text = await shown(view(lines, { ord_1: 'Jane Doe' }))
    assert.equal(text.filter((t) => t.startsWith('Ship to patient')).length, 1)
  })

  test('renders exactly as before when no ship-to info is supplied', async () => {
    const text = await shown(view(lines))
    assert.equal(text.filter((t) => t.startsWith('Ship to patient')).length, 0)
    assert.ok(text.includes('Consulting fee'))
    assert.ok(text.includes('INV-00057'))
  })

  test('unusual characters in a patient name or line cannot crash the PDF', async () => {
    const text = await shown(
      view(
        [
          { description: 'Order #1044 \u2014 2026-09-03\nsecond line', orderId: 'ord_3', amount: 10 },
          { description: 'Custom \uD83D\uDE42 item', orderId: null, amount: 5 },
        ],
        { ord_3: 'Nguy\u1EC5n V\u0103n \uD83D\uDE42 An' }
      )
    )
    assert.ok(text.includes('Ship to patient: Nguyen Van ? An'))
  })
})
