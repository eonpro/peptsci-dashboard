import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type Stripe from 'stripe'
import {
  salesRecordDataFromPaymentIntent,
  summarizeInvoiceLines,
} from '../stripe/sales-ingest.ts'

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
    assert.match(data.notes, /invoice ERVJH84E-0042/)
    assert.match(data.notes, /refunded \$200\.00/)
  })
})

describe('summarizeInvoiceLines', () => {
  test('multiple lines: label with +N more, quantities summed', () => {
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
  })

  test('empty invoice: no product, zero quantity', () => {
    const out = summarizeInvoiceLines(null, new Map())
    assert.deepEqual(out, { product: '', quantity: 0, cogs: null })
  })
})
