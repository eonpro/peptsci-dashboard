import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateCartInput,
  computeShipping,
  computeCartTotals,
  qualifiesForFreeShipping,
  round2,
  CartValidationError,
  FREE_SHIPPING_THRESHOLD,
  SHIPPING_RATES,
  MAX_LINE_QUANTITY,
} from '../checkout-core.ts'

describe('validateCartInput', () => {
  test('accepts a valid cart and normalizes skus', () => {
    const result = validateCartInput([
      { sku: ' SEMA-10 ', quantity: 2 },
      { sku: 'TIRZ-5', quantity: 1 },
    ])
    assert.deepEqual(result, [
      { sku: 'SEMA-10', quantity: 2 },
      { sku: 'TIRZ-5', quantity: 1 },
    ])
  })

  test('rejects an empty cart', () => {
    assert.throws(() => validateCartInput([]), (e: unknown) => {
      return e instanceof CartValidationError && e.code === 'CART_EMPTY'
    })
    assert.throws(() => validateCartInput(null), CartValidationError)
  })

  test('rejects missing sku', () => {
    assert.throws(
      () => validateCartInput([{ quantity: 1 }]),
      (e: unknown) => e instanceof CartValidationError && e.code === 'CART_SKU_MISSING'
    )
  })

  test('rejects duplicate skus', () => {
    assert.throws(
      () =>
        validateCartInput([
          { sku: 'A', quantity: 1 },
          { sku: 'A', quantity: 2 },
        ]),
      (e: unknown) => e instanceof CartValidationError && e.code === 'CART_DUPLICATE_SKU'
    )
  })

  test('rejects non-integer, zero, negative, and oversized quantities', () => {
    assert.throws(
      () => validateCartInput([{ sku: 'A', quantity: 1.5 }]),
      (e: unknown) => e instanceof CartValidationError && e.code === 'CART_QTY_INVALID'
    )
    assert.throws(() => validateCartInput([{ sku: 'A', quantity: 0 }]), CartValidationError)
    assert.throws(() => validateCartInput([{ sku: 'A', quantity: -3 }]), CartValidationError)
    assert.throws(
      () => validateCartInput([{ sku: 'A', quantity: MAX_LINE_QUANTITY + 1 }]),
      (e: unknown) => e instanceof CartValidationError && e.code === 'CART_QTY_TOO_LARGE'
    )
  })
})

describe('qualifiesForFreeShipping', () => {
  test('true at/above threshold, false below', () => {
    assert.equal(qualifiesForFreeShipping(FREE_SHIPPING_THRESHOLD), true)
    assert.equal(qualifiesForFreeShipping(FREE_SHIPPING_THRESHOLD - 0.01), false)
    assert.equal(qualifiesForFreeShipping(1000), true)
  })
})

describe('computeShipping (tiered matrix)', () => {
  test('below $500: 2-day $15, overnight $25', () => {
    assert.equal(computeShipping(100, 'TWO_DAY'), 15)
    assert.equal(computeShipping(100, 'OVERNIGHT'), 25)
    assert.equal(computeShipping(FREE_SHIPPING_THRESHOLD - 0.01, 'TWO_DAY'), 15)
    assert.equal(computeShipping(FREE_SHIPPING_THRESHOLD - 0.01, 'OVERNIGHT'), 25)
  })

  test('at/above $500: 2-day FREE, overnight $20', () => {
    assert.equal(computeShipping(FREE_SHIPPING_THRESHOLD, 'TWO_DAY'), 0)
    assert.equal(computeShipping(FREE_SHIPPING_THRESHOLD, 'OVERNIGHT'), 20)
    assert.equal(computeShipping(1000, 'TWO_DAY'), 0)
    assert.equal(computeShipping(1000, 'OVERNIGHT'), 20)
  })

  test('defaults to 2-day when speed omitted', () => {
    assert.equal(computeShipping(100), SHIPPING_RATES.STANDARD.TWO_DAY)
    assert.equal(computeShipping(600), SHIPPING_RATES.QUALIFIED.TWO_DAY)
  })

  test('is zero for an empty/zero cart regardless of speed', () => {
    assert.equal(computeShipping(0, 'OVERNIGHT'), 0)
    assert.equal(computeShipping(-5, 'TWO_DAY'), 0)
  })
})

describe('computeCartTotals', () => {
  test('no tax; 2-day shipping below threshold', () => {
    const totals = computeCartTotals([{ lineTotal: 100 }, { lineTotal: 50 }], 'TWO_DAY')
    assert.deepEqual(totals, {
      subtotal: 150,
      taxTotal: 0,
      shippingTotal: 15,
      total: 165,
    })
  })

  test('overnight below threshold adds $25', () => {
    const totals = computeCartTotals([{ lineTotal: 150 }], 'OVERNIGHT')
    assert.deepEqual(totals, { subtotal: 150, taxTotal: 0, shippingTotal: 25, total: 175 })
  })

  test('free 2-day over threshold, still no tax', () => {
    const totals = computeCartTotals([{ lineTotal: 600 }], 'TWO_DAY')
    assert.deepEqual(totals, { subtotal: 600, taxTotal: 0, shippingTotal: 0, total: 600 })
  })

  test('discounted overnight over threshold ($20)', () => {
    const totals = computeCartTotals([{ lineTotal: 600 }], 'OVERNIGHT')
    assert.deepEqual(totals, { subtotal: 600, taxTotal: 0, shippingTotal: 20, total: 620 })
  })

  test('handles floating point line totals without drift', () => {
    const totals = computeCartTotals([{ lineTotal: 19.99 }, { lineTotal: 0.02 }], 'TWO_DAY')
    assert.equal(totals.subtotal, 20.01)
    assert.equal(totals.total, round2(20.01 + 15))
  })
})
