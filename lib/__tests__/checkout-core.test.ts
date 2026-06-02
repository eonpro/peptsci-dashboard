import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateCartInput,
  computeShipping,
  computeCartTotals,
  round2,
  CartValidationError,
  FREE_SHIPPING_THRESHOLD,
  FLAT_SHIPPING_RATE,
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

describe('computeShipping', () => {
  test('is flat rate below threshold', () => {
    assert.equal(computeShipping(100), FLAT_SHIPPING_RATE)
    assert.equal(computeShipping(FREE_SHIPPING_THRESHOLD - 0.01), FLAT_SHIPPING_RATE)
  })

  test('is free at/above threshold', () => {
    assert.equal(computeShipping(FREE_SHIPPING_THRESHOLD), 0)
    assert.equal(computeShipping(1000), 0)
  })

  test('is zero for an empty/zero cart', () => {
    assert.equal(computeShipping(0), 0)
    assert.equal(computeShipping(-5), 0)
  })
})

describe('computeCartTotals', () => {
  test('no tax; adds flat shipping below threshold', () => {
    const totals = computeCartTotals([{ lineTotal: 100 }, { lineTotal: 50 }])
    assert.deepEqual(totals, {
      subtotal: 150,
      taxTotal: 0,
      shippingTotal: FLAT_SHIPPING_RATE,
      total: 175,
    })
  })

  test('free shipping over threshold, still no tax', () => {
    const totals = computeCartTotals([{ lineTotal: 600 }])
    assert.deepEqual(totals, {
      subtotal: 600,
      taxTotal: 0,
      shippingTotal: 0,
      total: 600,
    })
  })

  test('handles floating point line totals without drift', () => {
    const totals = computeCartTotals([{ lineTotal: 19.99 }, { lineTotal: 0.02 }])
    assert.equal(totals.subtotal, 20.01)
    assert.equal(totals.total, round2(20.01 + FLAT_SHIPPING_RATE))
  })
})
