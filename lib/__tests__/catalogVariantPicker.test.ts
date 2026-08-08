import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  filterCatalogVariantsForPicker,
  parseDoseMg,
  suggestProductQueryFromDescription,
} from '../catalog-variant-picker'

type Row = {
  id: string
  sku: string | null
  productName: string
  dose: string | null
  available: number
}

function row(
  id: string,
  dose: string,
  available: number,
  sku = `TR${id}`
): Row {
  return { id, sku, productName: 'Tirzepatide', dose, available }
}

describe('parseDoseMg', () => {
  test('parses common dose labels', () => {
    assert.equal(parseDoseMg('60mg'), 60)
    assert.equal(parseDoseMg('60.0mg'), 60)
    assert.equal(parseDoseMg('45 mg'), 45)
    assert.equal(parseDoseMg('10.0mg'), 10)
  })

  test('missing dose sorts last', () => {
    assert.equal(parseDoseMg(null), Number.POSITIVE_INFINITY)
    assert.equal(parseDoseMg(''), Number.POSITIVE_INFINITY)
  })
})

describe('suggestProductQueryFromDescription', () => {
  test('strips +N more fluff from Stripe descriptions', () => {
    assert.equal(
      suggestProductQueryFromDescription('Tirzepatide 60mg +1 more'),
      'Tirzepatide 60mg'
    )
  })

  test('handles empty', () => {
    assert.equal(suggestProductQueryFromDescription(null), '')
    assert.equal(suggestProductQueryFromDescription(''), '')
  })
})

describe('filterCatalogVariantsForPicker', () => {
  const catalog: Row[] = [
    row('10', '10.0mg', 0, 'TR10'),
    row('15', '15.0mg', 0, 'TR15'),
    row('20', '20.0mg', 0, 'TR20'),
    row('30', '30.0mg', 0, 'TR30'),
    row('40', '40.0mg', 0, 'TR40'),
    row('45', '45 mg', 0, 'TIRZ45'),
    row('5', '5.0mg', 0, 'TR5'),
    row('50', '50.0mg', 0, 'TR50'),
    row('60', '60mg', 42, 'TR60'),
    row('100', '100mg', 0, 'TR100'),
  ]

  test('empty query returns no rows', () => {
    assert.deepEqual(filterCatalogVariantsForPicker(catalog, ''), [])
    assert.deepEqual(filterCatalogVariantsForPicker(catalog, '   '), [])
  })

  test('in-stock 60mg ranks above zero-stock doses for "tirzepatide"', () => {
    const hits = filterCatalogVariantsForPicker(catalog, 'tirzepatide')
    assert.equal(hits[0]?.dose, '60mg')
    assert.equal(hits[0]?.available, 42)
    assert.ok(hits.some((h) => h.dose === '60mg'))
  })

  test('tokenized query "tirzepatide 60" finds 60mg (old includes-whole-string failed)', () => {
    const hits = filterCatalogVariantsForPicker(catalog, 'tirzepatide 60')
    assert.equal(hits.length, 1)
    assert.equal(hits[0]?.dose, '60mg')
  })

  test('does not bury 60mg behind an 8-item lexicographic dose slice', () => {
    // Old ConvertStripeModal: filter then .slice(0, 8) after dose-asc API order
    // would drop 60mg (9th+ after 10/100/15/20/30/40/45/5…).
    const hits = filterCatalogVariantsForPicker(catalog, 'tirzepatide', 8)
    assert.ok(
      hits.some((h) => h.dose === '60mg'),
      '60mg must appear within the first 8 when it has stock'
    )
    assert.equal(hits[0]?.dose, '60mg')
  })

  test('respects limit after ranking', () => {
    const hits = filterCatalogVariantsForPicker(catalog, 'tirzepatide', 3)
    assert.equal(hits.length, 3)
    assert.equal(hits[0]?.dose, '60mg')
  })

  test('sku search still works', () => {
    const hits = filterCatalogVariantsForPicker(catalog, 'tr60')
    assert.equal(hits.length, 1)
    assert.equal(hits[0]?.sku, 'TR60')
  })
})
