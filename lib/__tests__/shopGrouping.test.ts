import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { groupProductsByParent, type ShopProduct } from '../types/shop'

function product(partial: Partial<ShopProduct> & Pick<ShopProduct, 'name' | 'sku'>): ShopProduct {
  return {
    id: partial.sku,
    dose: partial.dose ?? '10mg',
    description: null,
    category: null,
    displayPrice: 50,
    images: [],
    status: 'ACTIVE',
    ...partial,
  }
}

describe('groupProductsByParent', () => {
  it('merges duplicate Tesamorelin parents into one card and keeps the priced SKU', () => {
    const grouped = groupProductsByParent([
      product({
        name: 'Tesamorelin',
        sku: 'TES-10',
        parentProductId: 'prod-seed',
        displayPrice: 129,
        aka: 'TH9507; Egrifta',
        casNumber: '218949-48-5',
      }),
      product({
        name: 'Tesamorelin',
        sku: 'TESAMORELIN-10MG',
        parentProductId: 'prod-import',
        displayPrice: 0,
      }),
    ])

    assert.equal(grouped.length, 1)
    assert.equal(grouped[0].sku, 'TES-10')
    assert.deepEqual(
      grouped[0].sizeOptions?.map((s) => s.sku),
      ['TES-10']
    )
    assert.deepEqual(grouped[0].availableDoses, ['10mg'])
  })

  it('does not merge Tesamorelin with Tesamorelin / Ipamorelin', () => {
    const grouped = groupProductsByParent([
      product({ name: 'Tesamorelin', sku: 'TES-10', parentProductId: 'a' }),
      product({
        name: 'Tesamorelin / Ipamorelin',
        sku: 'TES-IPA',
        dose: '10mg/5mg',
        parentProductId: 'b',
      }),
    ])

    const names = grouped.map((p) => p.name).sort()
    assert.deepEqual(names, ['Tesamorelin', 'Tesamorelin / Ipamorelin'])
  })

  it('still collapses sibling mg sizes of the same compound', () => {
    const grouped = groupProductsByParent([
      product({
        name: 'Sermorelin',
        sku: 'SER-5',
        dose: '5mg',
        parentProductId: 'serm',
        displayPrice: 59,
      }),
      product({
        name: 'Sermorelin',
        sku: 'SER-10',
        dose: '10mg',
        parentProductId: 'serm',
        displayPrice: 89,
      }),
    ])

    assert.equal(grouped.length, 1)
    assert.deepEqual(
      grouped[0].sizeOptions?.map((s) => s.sku),
      ['SER-5', 'SER-10']
    )
  })
})
