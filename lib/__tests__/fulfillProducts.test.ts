import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  mergeCatalogLinesForOrder,
  matchVariantIdFromDescription,
} from '../invoicing/fulfill-products.ts'

describe('mergeCatalogLinesForOrder', () => {
  test('sums quantities for duplicate variants', () => {
    const merged = mergeCatalogLinesForOrder([
      { variantId: 'a', quantity: 2, unitPrice: 10 },
      { variantId: 'b', quantity: 1, unitPrice: 20 },
      { variantId: 'a', quantity: 3, unitPrice: 11 },
    ])
    assert.deepEqual(merged, [
      { variantId: 'a', quantity: 5, unitPrice: 10 },
      { variantId: 'b', quantity: 1, unitPrice: 20 },
    ])
  })
})

describe('matchVariantIdFromDescription', () => {
  const catalog = [
    { id: 'v1', sku: 'RT10', productName: 'Retatrutide', dose: '10.0mg' },
    { id: 'v2', sku: 'BC10', productName: 'BPC-157', dose: '10.0mg' },
  ]

  test('matches middot SKU label from NewInvoiceDialog', () => {
    assert.equal(
      matchVariantIdFromDescription('Retatrutide 10.0mg · RT10', catalog),
      'v1'
    )
  })

  test('matches dash-separated SKU labels', () => {
    assert.equal(
      matchVariantIdFromDescription('Retatrutide 10.0mg - RT10', catalog),
      'v1'
    )
  })

  test('matches bare SKU', () => {
    assert.equal(matchVariantIdFromDescription('BC10', catalog), 'v2')
  })

  test('returns null when unknown', () => {
    assert.equal(matchVariantIdFromDescription('Custom consulting fee', catalog), null)
  })
})
