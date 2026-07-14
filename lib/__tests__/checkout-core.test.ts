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
  MAX_SHOP_ITEM_QUANTITY,
  findStockShortages,
  describeStockShortages,
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
    // Shop carts cap at the shop per-line quantity (100), not the internal
    // 999 admin ceiling — resolveCart only serves shop checkout.
    assert.throws(
      () => validateCartInput([{ sku: 'A', quantity: MAX_SHOP_ITEM_QUANTITY + 1 }]),
      (e: unknown) => e instanceof CartValidationError && e.code === 'CART_QTY_TOO_LARGE'
    )
    assert.equal(
      validateCartInput([{ sku: 'A', quantity: MAX_SHOP_ITEM_QUANTITY }])[0].quantity,
      MAX_SHOP_ITEM_QUANTITY
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
  test('below $500: 2-day $25, overnight $35', () => {
    assert.equal(computeShipping(100, 'TWO_DAY'), 25)
    assert.equal(computeShipping(100, 'OVERNIGHT'), 35)
    assert.equal(computeShipping(FREE_SHIPPING_THRESHOLD - 0.01, 'TWO_DAY'), 25)
    assert.equal(computeShipping(FREE_SHIPPING_THRESHOLD - 0.01, 'OVERNIGHT'), 35)
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
      shippingTotal: 25,
      total: 175,
    })
  })

  test('overnight below threshold adds $35', () => {
    const totals = computeCartTotals([{ lineTotal: 150 }], 'OVERNIGHT')
    assert.deepEqual(totals, { subtotal: 150, taxTotal: 0, shippingTotal: 35, total: 185 })
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
    assert.equal(totals.total, round2(20.01 + 25))
  })
})

describe('findStockShortages (oversell gate)', () => {
  const line = (quantity: number, available: number, sku = 'SEMA-10') => ({
    sku,
    productName: 'Semaglutide',
    quantity,
    available,
  })

  test('passes when every line has enough sellable stock', () => {
    assert.deepEqual(findStockShortages([line(2, 5), line(1, 1, 'TIRZ-5')]), [])
  })

  test('flags a line requesting more than available', () => {
    const shortages = findStockShortages([line(3, 2)])
    assert.equal(shortages.length, 1)
    assert.equal(shortages[0].sku, 'SEMA-10')
  })

  test('exact availability is allowed (quantity === available)', () => {
    assert.deepEqual(findStockShortages([line(4, 4)]), [])
  })

  test('negative availability (already oversold) blocks any quantity', () => {
    const shortages = findStockShortages([line(1, -3)])
    assert.equal(shortages.length, 1)
  })

  test('zero availability blocks and message clamps to 0 available', () => {
    const shortages = findStockShortages([line(2, -1)])
    const msg = describeStockShortages(shortages)
    assert.match(msg, /Semaglutide \(SEMA-10\): requested 2, 0 available/)
  })

  test('describes multiple shortages joined with semicolons', () => {
    const msg = describeStockShortages(
      findStockShortages([line(3, 1), line(5, 0, 'TIRZ-5')])
    )
    assert.match(msg, /SEMA-10/)
    assert.match(msg, /TIRZ-5/)
    assert.match(msg, /; /)
  })
})
