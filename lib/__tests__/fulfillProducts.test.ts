import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  mergeCatalogLinesForOrder,
  matchVariantIdFromDescription,
} from '../invoicing/fulfill-products.ts'

describe('mergeCatalogLinesForOrder', () => {
  test('sums quantities for the same variant', () => {
    const merged = mergeCatalogLinesForOrder([
      { variantId: 'v1', quantity: 2, unitPrice: 100 },
      { variantId: 'v2', quantity: 1, unitPrice: 50 },
      { variantId: 'v1', quantity: 3, unitPrice: 100 },
    ])
    assert.deepEqual(merged, [
      { variantId: 'v1', quantity: 5, unitPrice: 100 },
      { variantId: 'v2', quantity: 1, unitPrice: 50 },
    ])
  })
})

describe('matchVariantIdFromDescription', () => {
  const catalog = [
    { id: 'a', sku: 'TIRZ-60', productName: 'Tirzepatide', dose: '60mg' },
    { id: 'b', sku: 'SEMA-10', productName: 'Semaglutide', dose: '10mg' },
  ]

  test('matches by SKU after middot', () => {
    assert.equal(
      matchVariantIdFromDescription('Tirzepatide 60mg · TIRZ-60', catalog),
      'a'
    )
  })

  test('matches full picker label', () => {
    assert.equal(
      matchVariantIdFromDescription('Semaglutide 10mg · SEMA-10', catalog),
      'b'
    )
  })

  test('matches name + dose without sku', () => {
    assert.equal(matchVariantIdFromDescription('Tirzepatide 60mg', catalog), 'a')
  })

  test('returns null when unknown', () => {
    assert.equal(matchVariantIdFromDescription('Custom consulting fee', catalog), null)
  })
})
