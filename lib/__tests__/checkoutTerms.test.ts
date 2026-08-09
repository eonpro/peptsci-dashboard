import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  assessTermsCheckout,
  normalizePaymentTermsDays,
  paymentTermsDaysSchema,
} from '../checkout-terms.ts'

describe('normalizePaymentTermsDays', () => {
  test('undefined stays omitted', () => {
    assert.equal(normalizePaymentTermsDays(undefined), undefined)
  })

  test('null and 0 become null (card-only)', () => {
    assert.equal(normalizePaymentTermsDays(null), null)
    assert.equal(normalizePaymentTermsDays(0), null)
  })

  test('positive days pass through', () => {
    assert.equal(normalizePaymentTermsDays(30), 30)
    assert.equal(normalizePaymentTermsDays(1), 1)
    assert.equal(normalizePaymentTermsDays(365), 365)
  })
})

describe('paymentTermsDaysSchema', () => {
  test('coerces 0 to null', () => {
    const parsed = paymentTermsDaysSchema.safeParse(0)
    assert.equal(parsed.success, true)
    if (parsed.success) assert.equal(parsed.data, null)
  })

  test('accepts null', () => {
    const parsed = paymentTermsDaysSchema.safeParse(null)
    assert.equal(parsed.success, true)
    if (parsed.success) assert.equal(parsed.data, null)
  })

  test('accepts valid net terms', () => {
    const parsed = paymentTermsDaysSchema.safeParse(30)
    assert.equal(parsed.success, true)
    if (parsed.success) assert.equal(parsed.data, 30)
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

  test('a zero or negative terms value is treated as no terms', () => {
    for (const days of [0, -5]) {
      const res = assessTermsCheckout({
        paymentTermsDays: days,
        creditLimit: null,
        openBalance: 0,
        orderTotal: 100,
      })
      assert.equal(res.allowed, false)
    }
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
