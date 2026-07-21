import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type Stripe from 'stripe'
import {
  salesRecordDataFromPaymentIntent,
  summarizeInvoiceLines,
} from '../stripe/sales-ingest.ts'
import { salesFromRecord } from '../sales.ts'

/** Minimal fake Stripe client: invoicePayments.list resolves to the given payments. */
function fakeStripe(invoice: Record<string, unknown> | null = null): Stripe {
  return {
    invoicePayments: {
      list: async () => ({ data: invoice ? [{ invoice }] : [] }),
    },
  } as unknown as Stripe
}

function fakePi(opts: {
  amountCents: number
  refundedCents?: number
  name?: string
  email?: string
}): Stripe.PaymentIntent {
  return {
    id: 'pi_test_1',
    created: 1750000000,
    amount: opts.amountCents,
    amount_received: opts.amountCents,
    status: 'succeeded',
    metadata: {},
    customer: null,
    latest_charge: {
      id: 'ch_test_1',
      amount: opts.amountCents,
      amount_refunded: opts.refundedCents ?? 0,
      billing_details: {
        name: opts.name ?? 'Jane Doe',
        email: opts.email ?? 'jane@example.com',
        phone: null,
        address: null,
      },
      receipt_email: null,
    },
  } as unknown as Stripe.PaymentIntent
}

describe('salesRecordDataFromPaymentIntent refund handling', () => {
  test('no refund: full amount, 35% fallback COGS', async () => {
    const data = await salesRecordDataFromPaymentIntent(
      fakeStripe(),
      fakePi({ amountCents: 10_000 }),
      new Map(),
      undefined
    )
    assert.equal(data.paidAmount, 100)
    assert.equal(data.cogs, 35)
    assert.equal(data.customerName, 'Jane Doe')
    assert.equal(data.notes, 'Imported from Stripe')
  })

  test('partial refund nets paidAmount and scales COGS proportionally', async () => {
    const data = await salesRecordDataFromPaymentIntent(
      fakeStripe(),
      fakePi({ amountCents: 10_000, refundedCents: 4_000 }),
      new Map(),
      undefined
    )
    assert.equal(data.paidAmount, 60)
    assert.equal(data.cogs, 21) // 35% of gross, scaled by 60/100
    assert.match(data.notes, /refunded \$40\.00/)
  })

  test('full refund zeroes revenue and COGS', async () => {
    const data = await salesRecordDataFromPaymentIntent(
      fakeStripe(),
      fakePi({ amountCents: 10_000, refundedCents: 10_000 }),
      new Map(),
      undefined
    )
    assert.equal(data.paidAmount, 0)
    assert.equal(data.cogs, 0)
    assert.match(data.notes, /FULLY REFUNDED/)
  })

  test('refund larger than charge clamps to zero (never negative)', async () => {
    const data = await salesRecordDataFromPaymentIntent(
      fakeStripe(),
      fakePi({ amountCents: 10_000, refundedCents: 12_000 }),
      new Map(),
      undefined
    )
    assert.equal(data.paidAmount, 0)
    assert.equal(data.cogs, 0)
  })

  test('invoice enrichment: number, lines, catalog COGS, refund-scaled', async () => {
    const invoice = {
      id: 'in_1',
      number: 'ERVJH84E-0042',
      customer_name: 'Clinic LLC',
      customer_email: 'billing@clinic.com',
      customer_phone: null,
      customer_address: null,
      lines: {
        data: [{ description: 'Tesamorelin 10mg', quantity: 4, amount: 40_000 }],
      },
    }
    const costLookup = new Map([['tesamorelin 10mg', 4.5]])
    const data = await salesRecordDataFromPaymentIntent(
      fakeStripe(invoice),
      fakePi({ amountCents: 40_000, refundedCents: 20_000, name: '' }),
      costLookup,
      undefined
    )
    assert.equal(data.orderRef, 'ERVJH84E-0042')
    assert.equal(data.customerName, 'Clinic LLC')
    assert.equal(data.vials, 4)
    assert.equal(data.product, 'Tesamorelin 10mg')
    assert.equal(data.paidAmount, 200) // 400 gross - 200 refunded
    assert.equal(data.cogs, 9) // catalog 4.50 x 4 = 18 gross, scaled by 0.5
    // Line breakdown is stored net of refunds, same scaling as the totals.
    assert.deepEqual(data.lineItems, [
      { product: 'Tesamorelin 10mg', quantity: 4, amount: 200, cogs: 9 },
    ])
    assert.match(data.notes, /invoice ERVJH84E-0042/)
    assert.match(data.notes, /refunded \$200\.00/)
  })
})

describe('summarizeInvoiceLines', () => {
  test('multiple lines: label with +N more, quantities summed, per-line breakdown kept', () => {
    const invoice = {
      lines: {
        data: [
          { description: 'BPC-157 10mg', quantity: 2, amount: 20_000 },
          { description: 'KPV 10mg', quantity: 3, amount: 15_000 },
        ],
      },
    } as unknown as Stripe.Invoice
    const out = summarizeInvoiceLines(invoice, new Map())
    assert.equal(out.product, 'BPC-157 10mg +1 more')
    assert.equal(out.quantity, 5)
    assert.equal(out.cogs, null) // nothing matched the catalog
    assert.equal(out.lineItems.length, 2)
    assert.equal(out.lineItems[0].product, 'BPC-157 10mg')
    assert.equal(out.lineItems[0].quantity, 2)
    assert.equal(out.lineItems[0].amount, 200)
    assert.equal(out.lineItems[1].product, 'KPV 10mg')
    assert.equal(out.lineItems[1].quantity, 3)
    assert.equal(out.lineItems[1].amount, 150)
  })

  test('empty invoice: no product, zero quantity', () => {
    const out = summarizeInvoiceLines(null, new Map())
    assert.deepEqual(out, { product: '', quantity: 0, cogs: null, lineItems: [] })
  })
})

describe('salesFromRecord line-item explosion', () => {
  const baseRow = {
    date: new Date('2026-07-01T12:00:00Z'),
    orderRef: 'INV-1',
    customerName: 'Clinic LLC',
    customerEmail: 'billing@clinic.com',
    customerPhone: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    trackingNumber: '',
    invoicePaid: true,
    paidAmount: 350,
    vials: 5,
    amountPerVial: 70,
    product: 'BPC-157 10mg +1 more',
    notes: '',
    unitCost: 10,
    cogs: 50,
  }

  test('no lineItems: single row with the stored label', () => {
    const sales = salesFromRecord({ ...baseRow, lineItems: null })
    assert.equal(sales.length, 1)
    assert.equal(sales[0].Product, 'BPC-157 10mg +1 more')
    assert.equal(sales[0].PaidAmount, 350)
  })

  test('multi-line record explodes into one Sale per product, totals preserved', () => {
    const sales = salesFromRecord({
      ...baseRow,
      lineItems: [
        { product: 'BPC-157 10mg', quantity: 2, amount: 200, cogs: 30 },
        { product: 'KPV 10mg', quantity: 3, amount: 150, cogs: 20 },
      ],
    })
    assert.equal(sales.length, 2)
    assert.equal(sales[0].Product, 'BPC-157 10mg')
    assert.equal(sales[0].PaidAmount, 200)
    assert.equal(sales[0].Vials, 2)
    assert.equal(sales[0].COGS, 30)
    assert.equal(sales[1].Product, 'KPV 10mg')
    assert.equal(sales[1].PaidAmount, 150)
    assert.equal(sales[1].Vials, 3)
    // Both rows keep the shared order identity so order-count grouping holds.
    assert.equal(sales[0].OrderID, 'INV-1')
    assert.equal(sales[1].OrderID, 'INV-1')
    const total = sales.reduce((s, x) => s + x.PaidAmount, 0)
    assert.equal(total, 350)
  })

  test('line sums are rescaled to the captured total (invoice-level discount)', () => {
    // Lines sum to 400 but only 350 was captured (e.g. a $50 invoice coupon).
    const sales = salesFromRecord({
      ...baseRow,
      lineItems: [
        { product: 'BPC-157 10mg', quantity: 2, amount: 240, cogs: 30 },
        { product: 'KPV 10mg', quantity: 3, amount: 160, cogs: 20 },
      ],
    })
    const total = sales.reduce((s, x) => s + x.PaidAmount, 0)
    assert.ok(Math.abs(total - 350) < 1e-9)
    assert.ok(Math.abs(sales[0].PaidAmount - 210) < 1e-9) // 240 * 350/400
    const cogsTotal = sales.reduce((s, x) => s + x.COGS, 0)
    assert.ok(Math.abs(cogsTotal - 50) < 1e-9)
  })

  test('single line: keeps totals but uses the dose-qualified line product name', () => {
    const sales = salesFromRecord({
      ...baseRow,
      product: 'Semaglutide',
      lineItems: [{ product: 'Semaglutide 5mg', quantity: 5, amount: 350, cogs: 50 }],
    })
    assert.equal(sales.length, 1)
    assert.equal(sales[0].Product, 'Semaglutide 5mg')
    assert.equal(sales[0].PaidAmount, 350)
  })

  test('malformed lineItems entries are ignored safely', () => {
    const sales = salesFromRecord({
      ...baseRow,
      lineItems: [{ nope: true }, 'garbage', null],
    })
    assert.equal(sales.length, 1)
    assert.equal(sales[0].Product, 'BPC-157 10mg +1 more')
  })
})
