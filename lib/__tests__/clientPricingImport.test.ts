import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseClientPricingCsv,
  clientPricingImportTemplate,
  CLIENT_PRICING_IMPORT_HEADERS,
  normalizeClientPricingDose,
} from '../client-pricing-import.ts'

describe('parseClientPricingCsv', () => {
  test('parses sku + Strength + custom_price with currency symbols', () => {
    const csv = [
      'sku,Strength,custom_price',
      'Semaglutide,5mg,$30',
      'Semaglutide,10mg,$40',
      'Tirzepatide,60mg,$100',
      'hGH,10iu,$35',
    ].join('\n')
    const { rows, errors } = parseClientPricingCsv(csv)
    assert.equal(errors.length, 0)
    assert.equal(rows.length, 4)
    assert.deepEqual(rows[0], {
      rowNumber: 2,
      sku: 'Semaglutide',
      strength: '5mg',
      customPrice: 30,
      notes: undefined,
      clear: false,
    })
    assert.equal(rows[1].sku, 'Semaglutide')
    assert.equal(rows[1].strength, '10mg')
    assert.equal(rows[1].customPrice, 40)
    assert.equal(rows[3].strength, '10iu')
    assert.equal(rows[3].customPrice, 35)
  })

  test('accepts dose alias for Strength header', () => {
    const csv = ['product,dose,price', 'AOD 9604,5mg,75'].join('\n')
    const { rows, errors } = parseClientPricingCsv(csv)
    assert.equal(errors.length, 0)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].sku, 'AOD 9604')
    assert.equal(rows[0].strength, '5mg')
    assert.equal(rows[0].customPrice, 75)
  })

  test('blank custom_price marks row as clear', () => {
    const csv = ['sku,Strength,custom_price', 'Semaglutide,5mg,'].join('\n')
    const { rows, errors } = parseClientPricingCsv(csv)
    assert.equal(errors.length, 0)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].clear, true)
    assert.equal(rows[0].customPrice, null)
  })

  test('reports missing Strength column', () => {
    const { rows, errors } = parseClientPricingCsv('sku,custom_price\nFoo,10')
    assert.equal(rows.length, 0)
    assert.equal(errors.length, 1)
    assert.match(errors[0].message, /Strength/)
  })

  test('flags per-row validation errors and continues', () => {
    const csv = [
      'sku,Strength,custom_price',
      ',5mg,10', // missing sku
      'Good,5mg,20', // ok
      'Bad,5mg,abc', // bad price
      'Good,5mg,15', // duplicate sku+strength
      'MissingStrength,,30', // missing strength
    ].join('\n')
    const { rows, errors } = parseClientPricingCsv(csv)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].sku, 'Good')
    assert.equal(errors.length, 4)
  })

  test('template includes canonical headers', () => {
    const t = clientPricingImportTemplate()
    for (const h of CLIENT_PRICING_IMPORT_HEADERS) {
      assert.match(t, new RegExp(h))
    }
    assert.match(t, /Semaglutide/)
  })
})

describe('normalizeClientPricingDose', () => {
  test('normalizes spaced and decimal doses', () => {
    assert.equal(normalizeClientPricingDose('5 mg'), '5mg')
    assert.equal(normalizeClientPricingDose('10.0mg'), '10mg')
    assert.equal(normalizeClientPricingDose('10iu'), '10iu')
  })
})
