import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  assessTermsCheckout,
  formatPaymentTermsLabel,
  normalizePaymentTermsDays,
  paymentTermsDaysSchema,
} from '../checkout-terms.ts'

describe('normalizePaymentTermsDays', () => {
  test('undefined stays omitted', () => {
    assert.equal(normalizePaymentTermsDays(undefined), undefined)
  })

  test('null stays null (card-only)', () => {
    assert.equal(normalizePaymentTermsDays(null), null)
  })

  test('0 stays 0 (pay as billed)', () => {
    assert.equal(normalizePaymentTermsDays(0), 0)
  })

  test('positive days pass through', () => {
    assert.equal(normalizePaymentTermsDays(30), 30)
    assert.equal(normalizePaymentTermsDays(7), 7)
    assert.equal(normalizePaymentTermsDays(14), 14)
  })

  test('negative becomes null', () => {
    assert.equal(normalizePaymentTermsDays(-5), null)
  })
})

describe('paymentTermsDaysSchema', () => {
  test('accepts 0 (pay as billed)', () => {
    const parsed = paymentTermsDaysSchema.safeParse(0)
    assert.equal(parsed.success, true)
    if (parsed.success) assert.equal(parsed.data, 0)
  })

  test('accepts null', () => {
    const parsed = paymentTermsDaysSchema.safeParse(null)
    assert.equal(parsed.success, true)
    if (parsed.success) assert.equal(parsed.data, null)
  })

  test('accepts valid net terms', () => {
    for (const days of [7, 14, 30]) {
      const parsed = paymentTermsDaysSchema.safeParse(days)
      assert.equal(parsed.success, true)
      if (parsed.success) assert.equal(parsed.data, days)
    }
  })

  test('rejects fractional days', () => {
    const parsed = paymentTermsDaysSchema.safeParse(0.5)
    assert.equal(parsed.success, false)
  })

  test('rejects out of range', () => {
    assert.equal(paymentTermsDaysSchema.safeParse(366).success, false)
    assert.equal(paymentTermsDaysSchema.safeParse(-1).success, false)
  })

  test('omitted stays undefined', () => {
    const parsed = paymentTermsDaysSchema.safeParse(undefined)
    assert.equal(parsed.success, true)
    if (parsed.success) assert.equal(parsed.data, undefined)
  })
})

describe('formatPaymentTermsLabel', () => {
  test('formats card-only, pay as billed, and net days', () => {
    assert.equal(formatPaymentTermsLabel(null), 'Card only')
    assert.equal(formatPaymentTermsLabel(0), 'Pay as billed (net 0)')
    assert.equal(formatPaymentTermsLabel(30), 'Net 30')
  })
})

describe('assessTermsCheckout', () => {
  test('denies when the client has no terms configured', () => {
    const res = assessTermsCheckout({
      paymentTermsDays: null,
      creditLimit: null,
      openBalance: 0,
      orderTotal: 100,
    })
    assert.equal(res.allowed, false)
    if (!res.allowed) assert.equal(res.reason, 'NO_TERMS')
  })

  test('allows pay as billed (net 0)', () => {
    const res = assessTermsCheckout({
      paymentTermsDays: 0,
      creditLimit: null,
      openBalance: 0,
      orderTotal: 100,
    })
    assert.deepEqual(res, { allowed: true, termsDays: 0 })
  })

  test('allows with terms and no credit limit', () => {
    const res = assessTermsCheckout({
      paymentTermsDays: 30,
      creditLimit: null,
      openBalance: 99999,
      orderTotal: 5000,
    })
    assert.deepEqual(res, { allowed: true, termsDays: 30 })
  })

  test('allows when open balance + order stays within the credit limit', () => {
    const res = assessTermsCheckout({
      paymentTermsDays: 15,
      creditLimit: 10000,
      openBalance: 4000,
      orderTotal: 6000,
    })
    assert.deepEqual(res, { allowed: true, termsDays: 15 })
  })

  test('denies when open balance + order exceeds the credit limit', () => {
    const res = assessTermsCheckout({
      paymentTermsDays: 30,
      creditLimit: 10000,
      openBalance: 4000,
      orderTotal: 6000.01,
    })
    assert.equal(res.allowed, false)
    if (!res.allowed) {
      assert.equal(res.reason, 'OVER_CREDIT_LIMIT')
      assert.equal(res.availableCredit, 6000)
    }
  })

  test('a negative terms value is treated as no terms', () => {
    const res = assessTermsCheckout({
      paymentTermsDays: -5,
      creditLimit: null,
      openBalance: 0,
      orderTotal: 100,
    })
    assert.equal(res.allowed, false)
    if (!res.allowed) assert.equal(res.reason, 'NO_TERMS')
  })

  test('availableCredit never reports negative', () => {
    const res = assessTermsCheckout({
      paymentTermsDays: 30,
      creditLimit: 1000,
      openBalance: 2500,
      orderTotal: 10,
    })
    assert.equal(res.allowed, false)
    if (!res.allowed && res.reason === 'OVER_CREDIT_LIMIT') {
      assert.equal(res.availableCredit, 0)
    }
  })

  test('credit hold: denies when any invoice is overdue, even within limit', () => {
    const res = assessTermsCheckout({
      paymentTermsDays: 30,
      creditLimit: 10000,
      openBalance: 100,
      orderTotal: 50,
      hasOverdue: true,
    })
    assert.equal(res.allowed, false)
    if (!res.allowed) assert.equal(res.reason, 'CREDIT_HOLD')
  })

  test('credit hold applies even without a credit limit', () => {
    const res = assessTermsCheckout({
      paymentTermsDays: 30,
      creditLimit: null,
      openBalance: 100,
      orderTotal: 50,
      hasOverdue: true,
    })
    assert.equal(res.allowed, false)
    if (!res.allowed) assert.equal(res.reason, 'CREDIT_HOLD')
  })

  test('hasOverdue false or omitted allows normally', () => {
    const omitted = assessTermsCheckout({
      paymentTermsDays: 30,
      creditLimit: null,
      openBalance: 0,
      orderTotal: 100,
    })
    const explicit = assessTermsCheckout({
      paymentTermsDays: 30,
      creditLimit: null,
      openBalance: 0,
      orderTotal: 100,
      hasOverdue: false,
    })
    assert.equal(omitted.allowed, true)
    assert.equal(explicit.allowed, true)
  })
})
