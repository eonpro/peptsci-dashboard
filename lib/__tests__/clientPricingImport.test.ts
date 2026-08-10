import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseClientPricingCsv,
  clientPricingImportTemplate,
  CLIENT_PRICING_IMPORT_HEADERS,
} from '../client-pricing-import.ts'

describe('parseClientPricingCsv', () => {
  test('parses valid rows with currency symbols and aliases', () => {
    const csv = [
      'SKU,Offer Price,Notes',
      'BPC-157-10,$45.00,Clinic deal',
      'TES-10,129.5,',
    ].join('\n')
    const { rows, errors } = parseClientPricingCsv(csv)
    assert.equal(errors.length, 0)
    assert.equal(rows.length, 2)
    assert.deepEqual(rows[0], {
      rowNumber: 2,
      sku: 'BPC-157-10',
      customPrice: 45,
      notes: 'Clinic deal',
      clear: false,
    })
    assert.deepEqual(rows[1], {
      rowNumber: 3,
      sku: 'TES-10',
      customPrice: 129.5,
      notes: undefined,
      clear: false,
    })
  })

  test('blank custom_price marks row as clear', () => {
    const csv = ['sku,custom_price,notes', 'BPC-157-10,,remove override'].join('\n')
    const { rows, errors } = parseClientPricingCsv(csv)
    assert.equal(errors.length, 0)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].clear, true)
    assert.equal(rows[0].customPrice, null)
    assert.equal(rows[0].notes, 'remove override')
  })

  test('reports missing required columns', () => {
    const { rows, errors } = parseClientPricingCsv('product,price\nFoo,10')
    assert.equal(rows.length, 0)
    assert.equal(errors.length, 1)
    assert.match(errors[0].message, /Missing required column/)
  })

  test('flags per-row validation errors and continues', () => {
    const csv = [
      'sku,custom_price',
      ',10', // missing sku
      'GOOD-1,20', // ok
      'BAD-1,abc', // bad price
      'BAD-2,0', // non-positive
      'GOOD-1,15', // duplicate
    ].join('\n')
    const { rows, errors } = parseClientPricingCsv(csv)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].sku, 'GOOD-1')
    assert.equal(errors.length, 4)
  })

  test('template includes canonical headers', () => {
    const t = clientPricingImportTemplate()
    for (const h of CLIENT_PRICING_IMPORT_HEADERS) {
      assert.match(t, new RegExp(h))
    }
  })
})
