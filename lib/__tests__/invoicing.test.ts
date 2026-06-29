import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  round2,
  lineAmount,
  resolveAdjustmentAmount,
  computeInvoiceTotals,
  deriveDueDate,
  daysPastDue,
  agingBucket,
  deriveInvoiceStatus,
  formatInvoiceNumber,
  isTerminalInvoiceStatus,
} from '../invoicing/core.ts'

describe('lineAmount + round2', () => {
  test('computes qty × unitPrice when amount absent', () => {
    assert.equal(lineAmount({ quantity: 3, unitPrice: 10.5 }), 31.5)
  })
  test('uses explicit amount when provided', () => {
    assert.equal(lineAmount({ quantity: 3, unitPrice: 10, amount: 99 }), 99)
  })
  test('round2 avoids float drift', () => {
    assert.equal(round2(0.1 + 0.2), 0.3)
  })
})

describe('resolveAdjustmentAmount', () => {
  test('fixed dollars pass through (signed)', () => {
    assert.equal(resolveAdjustmentAmount({ kind: 'FIXED', amount: -25 }, 1000), -25)
    assert.equal(resolveAdjustmentAmount({ kind: 'FIXED', amount: 15 }, 1000), 15)
  })
  test('percent is of subtotal', () => {
    assert.equal(resolveAdjustmentAmount({ kind: 'PERCENT', percent: -10 }, 1000), -100)
    assert.equal(resolveAdjustmentAmount({ kind: 'PERCENT', percent: 8.5 }, 200), 17)
  })
})

describe('computeInvoiceTotals', () => {
  test('sums lines, splits discounts/surcharges, applies balance forward', () => {
    const totals = computeInvoiceTotals({
      lineItems: [
        { quantity: 2, unitPrice: 100 }, // 200
        { quantity: 1, unitPrice: 50 }, // 50
      ],
      adjustments: [
        { kind: 'PERCENT', percent: -10 }, // -25 discount
        { kind: 'FIXED', amount: 15 }, // +15 surcharge
      ],
      payments: [{ amount: 40 }],
      balanceForward: 30,
    })
    assert.equal(totals.subtotal, 250)
    assert.equal(totals.totalDiscounts, 25)
    assert.equal(totals.totalSurcharges, 15)
    assert.equal(totals.totalAdjustments, -10)
    assert.equal(totals.grossTotal, 270) // 250 - 10 + 30
    assert.equal(totals.totalPayments, 40)
    assert.equal(totals.amountDue, 230)
    assert.equal(totals.creditBalance, 0)
  })

  test('overpayment yields a credit balance, no negative due', () => {
    const totals = computeInvoiceTotals({
      lineItems: [{ quantity: 1, unitPrice: 100 }],
      payments: [{ amount: 130 }],
    })
    assert.equal(totals.amountDue, 0)
    assert.equal(totals.creditBalance, 30)
  })
})

describe('due date + aging', () => {
  const issue = new Date('2026-01-01T00:00:00.000Z')
  test('deriveDueDate adds terms days', () => {
    assert.equal(deriveDueDate(issue, 30).toISOString().slice(0, 10), '2026-01-31')
    assert.equal(deriveDueDate(issue, 0).toISOString().slice(0, 10), '2026-01-01')
  })
  test('daysPastDue is signed', () => {
    const due = new Date('2026-01-31T00:00:00.000Z')
    assert.equal(daysPastDue(due, new Date('2026-02-10T00:00:00.000Z')), 10)
    assert.ok(daysPastDue(due, new Date('2026-01-20T00:00:00.000Z')) < 0)
  })
  test('aging buckets by days overdue', () => {
    const due = new Date('2026-01-31T00:00:00.000Z')
    assert.equal(agingBucket(100, due, new Date('2026-01-15T00:00:00.000Z')), 'current')
    assert.equal(agingBucket(100, due, new Date('2026-02-20T00:00:00.000Z')), 'net30')
    assert.equal(agingBucket(100, due, new Date('2026-03-25T00:00:00.000Z')), 'net60')
    assert.equal(agingBucket(100, due, new Date('2026-06-01T00:00:00.000Z')), 'over90')
    assert.equal(agingBucket(0, due, new Date('2026-06-01T00:00:00.000Z')), 'current')
  })
})

describe('deriveInvoiceStatus', () => {
  const due = new Date('2026-01-31T00:00:00.000Z')
  const before = new Date('2026-01-15T00:00:00.000Z')
  const after = new Date('2026-02-15T00:00:00.000Z')
  test('paid when nothing due', () => {
    assert.equal(
      deriveInvoiceStatus({ totals: { amountDue: 0, totalPayments: 100, grossTotal: 100 }, dueDate: due, now: before }),
      'PAID'
    )
  })
  test('overdue beats partial once past due', () => {
    assert.equal(
      deriveInvoiceStatus({ totals: { amountDue: 50, totalPayments: 50, grossTotal: 100 }, dueDate: due, now: after }),
      'OVERDUE'
    )
  })
  test('partial when paid-something and not past due', () => {
    assert.equal(
      deriveInvoiceStatus({ totals: { amountDue: 50, totalPayments: 50, grossTotal: 100 }, dueDate: due, now: before }),
      'PARTIAL'
    )
  })
  test('open when unpaid and not past due', () => {
    assert.equal(
      deriveInvoiceStatus({ totals: { amountDue: 100, totalPayments: 0, grossTotal: 100 }, dueDate: due, now: before }),
      'OPEN'
    )
  })
})

describe('formatting + helpers', () => {
  test('pads invoice number', () => {
    assert.equal(formatInvoiceNumber(42), 'INV-00042')
    assert.equal(formatInvoiceNumber(123456), 'INV-123456')
  })
  test('terminal statuses', () => {
    assert.equal(isTerminalInvoiceStatus('PAID'), true)
    assert.equal(isTerminalInvoiceStatus('VOID'), true)
    assert.equal(isTerminalInvoiceStatus('OPEN'), false)
  })
})
