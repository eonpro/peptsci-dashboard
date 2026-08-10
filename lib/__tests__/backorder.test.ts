import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  BACKORDER_MIN_QUANTITY,
  clampBackorderQuantity,
  isZeroStock,
  validateBackorderQuantity,
} from '../shop/backorder.ts'

describe('backorder helpers', () => {
  test('isZeroStock treats <=0 as zero', () => {
    assert.equal(isZeroStock(0), true)
    assert.equal(isZeroStock(-2), true)
    assert.equal(isZeroStock(1), false)
  })

  test('validateBackorderQuantity requires MOQ only when stock is zero', () => {
    assert.equal(validateBackorderQuantity(5, 10), null)
    assert.equal(validateBackorderQuantity(1, 0)?.includes(String(BACKORDER_MIN_QUANTITY)), true)
    assert.equal(validateBackorderQuantity(BACKORDER_MIN_QUANTITY, 0), null)
    assert.equal(validateBackorderQuantity(BACKORDER_MIN_QUANTITY + 5, 0), null)
  })

  test('clampBackorderQuantity enforces min 20 and max', () => {
    assert.equal(clampBackorderQuantity(1), BACKORDER_MIN_QUANTITY)
    assert.equal(clampBackorderQuantity(25), 25)
    assert.equal(clampBackorderQuantity(200, 100), 100)
  })
})
