import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { assessTermsCheckout } from '../checkout-terms.ts'

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
})
