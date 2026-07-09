import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateManualLines,
  buildManualOrderLines,
  ManualOrderError,
  type VariantPriceInfo,
} from '../orders/order-core.ts'

function info(overrides: Partial<VariantPriceInfo> & { variantId: string }): VariantPriceInfo {
  return {
    sku: 'SKU-1',
    productName: 'Semaglutide',
    dose: '5mg',
    srp: 100,
    customPrice: null,
    ...overrides,
  }
}

describe('validateManualLines', () => {
  test('accepts valid lines and normalizes ids/overrides', () => {
    const result = validateManualLines([
      { variantId: ' v1 ', quantity: 2 },
      { variantId: 'v2', quantity: 1, unitPrice: 12.005 },
    ])
    assert.deepEqual(result, [
      { variantId: 'v1', quantity: 2, unitPrice: null },
      { variantId: 'v2', quantity: 1, unitPrice: 12.01 },
    ])
  })

  test('rejects an empty order', () => {
    assert.throws(
      () => validateManualLines([]),
      (e: unknown) => e instanceof ManualOrderError && e.code === 'LINES_EMPTY'
    )
    assert.throws(() => validateManualLines(null), ManualOrderError)
  })

  test('rejects a missing variantId', () => {
    assert.throws(
      () => validateManualLines([{ quantity: 1 }]),
      (e: unknown) => e instanceof ManualOrderError && e.code === 'LINE_VARIANT_MISSING'
    )
  })

  test('rejects duplicate variants', () => {
    assert.throws(
      () => validateManualLines([
        { variantId: 'v1', quantity: 1 },
        { variantId: 'v1', quantity: 2 },
      ]),
      (e: unknown) => e instanceof ManualOrderError && e.code === 'LINE_DUPLICATE'
    )
  })

  test('rejects non-positive / non-integer quantities', () => {
    assert.throws(
      () => validateManualLines([{ variantId: 'v1', quantity: 0 }]),
      (e: unknown) => e instanceof ManualOrderError && e.code === 'LINE_QTY_INVALID'
    )
    assert.throws(
      () => validateManualLines([{ variantId: 'v1', quantity: 1.5 }]),
      (e: unknown) => e instanceof ManualOrderError && e.code === 'LINE_QTY_INVALID'
    )
  })

  test('rejects a negative price override', () => {
    assert.throws(
      () => validateManualLines([{ variantId: 'v1', quantity: 1, unitPrice: -5 }]),
      (e: unknown) => e instanceof ManualOrderError && e.code === 'LINE_PRICE_INVALID'
    )
  })
})

describe('buildManualOrderLines', () => {
  test('uses catalog SRP when no override or custom price', () => {
    const lines = buildManualOrderLines(
      [{ variantId: 'v1', quantity: 3, unitPrice: null }],
      new Map([['v1', info({ variantId: 'v1', srp: 100 })]])
    )
    assert.equal(lines[0].unitPrice, 100)
    assert.equal(lines[0].lineTotal, 300)
    assert.equal(lines[0].isCustomPrice, false)
  })

  test('prefers the client custom price over SRP', () => {
    const lines = buildManualOrderLines(
      [{ variantId: 'v1', quantity: 2, unitPrice: null }],
      new Map([['v1', info({ variantId: 'v1', srp: 100, customPrice: 80 })]])
    )
    assert.equal(lines[0].unitPrice, 80)
    assert.equal(lines[0].lineTotal, 160)
    assert.equal(lines[0].isCustomPrice, true)
  })

  test('an explicit override wins over both SRP and custom price', () => {
    const lines = buildManualOrderLines(
      [{ variantId: 'v1', quantity: 2, unitPrice: 55.5 }],
      new Map([['v1', info({ variantId: 'v1', srp: 100, customPrice: 80 })]])
    )
    assert.equal(lines[0].unitPrice, 55.5)
    assert.equal(lines[0].lineTotal, 111)
    assert.equal(lines[0].isCustomPrice, true)
  })

  test('throws for an unknown variant', () => {
    assert.throws(
      () => buildManualOrderLines([{ variantId: 'ghost', quantity: 1 }], new Map()),
      (e: unknown) => e instanceof ManualOrderError && e.code === 'LINE_VARIANT_UNKNOWN'
    )
  })
})
