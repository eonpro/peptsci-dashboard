import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  BAC_WATER_SIZES,
  BAC_WATER_SKUS,
  bacWaterLabelVolume,
  bacWaterVolumeMl,
  bacWaterCatalogRows,
  cartHasBacWater,
  formatBacWaterSizeLabel,
  isBacteriostaticWaterProduct,
  isLegacyBacWaterThirtyMl,
  omitsPeptideSciSpecs,
  peptideVialCount,
  shouldOfferBacWaterAtCheckout,
  suggestedBacWaterQty,
  usesHospiraBacPhoto,
  usesPeptSciBacLabel,
} from '../shop/bac-water'
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

describe('BAC water catalog sizes', () => {
  it('lists 3mL $5, 10mL $10, and Hospira 30mL $20', () => {
    assert.deepEqual(
      BAC_WATER_SIZES.map((s) => ({ sku: s.sku, dose: s.dose, listPrice: s.listPrice, presentation: s.presentation })),
      [
        { sku: BAC_WATER_SKUS.labeled3ml, dose: '3mL', listPrice: 5, presentation: 'peptsci-label' },
        { sku: BAC_WATER_SKUS.labeled10ml, dose: '10mL', listPrice: 10, presentation: 'peptsci-label' },
        { sku: BAC_WATER_SKUS.hospira30ml, dose: '30mL', listPrice: 20, presentation: 'hospira' },
      ]
    )
  })

  it('groups the three sizes onto one Bacteriostatic Water card', () => {
    const grouped = groupProductsByParent([
      product({
        name: 'Bacteriostatic Water',
        sku: BAC_WATER_SKUS.labeled3ml,
        dose: '3mL',
        displayPrice: 5,
        parentProductId: 'bac',
      }),
      product({
        name: 'Bacteriostatic Water',
        sku: BAC_WATER_SKUS.labeled10ml,
        dose: '10mL',
        displayPrice: 10,
        parentProductId: 'bac',
      }),
      product({
        name: 'Bacteriostatic Water',
        sku: BAC_WATER_SKUS.hospira30ml,
        dose: '30mL',
        displayPrice: 20,
        parentProductId: 'bac',
      }),
    ])
    assert.equal(grouped.length, 1)
    assert.equal(grouped[0].sku, BAC_WATER_SKUS.labeled3ml)
    assert.deepEqual(
      grouped[0].sizeOptions?.map((s) => s.dose),
      ['3mL', '10mL', '30mL']
    )
  })
})

describe('BAC water presentation', () => {
  it('uses a PeptSci label for 3mL and 10mL and Hospira art for 30mL', () => {
    assert.equal(usesPeptSciBacLabel('Bacteriostatic Water', '3mL'), true)
    assert.equal(usesPeptSciBacLabel('Bacteriostatic Water', '10mL'), true)
    assert.equal(usesPeptSciBacLabel('Bacteriostatic Water', '30mL'), false)
    assert.equal(usesHospiraBacPhoto('Bacteriostatic Water', '30mL'), true)
    assert.equal(usesHospiraBacPhoto('Bacteriostatic Water', '3mL'), false)
    assert.equal(usesHospiraBacPhoto('BAC Water 30ml'), true)
    assert.equal(bacWaterLabelVolume('Bacteriostatic Water', '10 mL'), '10mL')
    assert.equal(bacWaterVolumeMl('Bacteriostatic Water', '3mL'), 3)
  })

  it('omits peptide sci specs (mg / 99% / CAS) for BAC water', () => {
    assert.equal(omitsPeptideSciSpecs('Bacteriostatic Water'), true)
    assert.equal(omitsPeptideSciSpecs('BPC-157'), false)
    assert.equal(isBacteriostaticWaterProduct('Retatrutide', 'RET-10'), false)
    assert.equal(isBacteriostaticWaterProduct('Retatrutide', 'BAC-H2O-3ML'), true)
  })

  it('treats the production BAC-H20 SKU as bacteriostatic water', () => {
    assert.equal(isBacteriostaticWaterProduct('', 'BAC-H20'), true)
    assert.equal(isBacteriostaticWaterProduct('Bacteriostatic Water', 'BAC-H20'), true)
    assert.equal(isLegacyBacWaterThirtyMl('BAC-H20', '0mg'), true)
    assert.equal(isLegacyBacWaterThirtyMl('BAC-H2O-3ML', '3mL'), false)
    assert.equal(formatBacWaterSizeLabel('0mg', 'BAC-H20'), '30mL')
    assert.equal(formatBacWaterSizeLabel('', 'BAC-H20'), '30mL')
    assert.equal(formatBacWaterSizeLabel('3mL', BAC_WATER_SKUS.labeled3ml), '3mL')
  })

  it('always lists 3mL $5, 10mL $10, and 30mL $20 even when only BAC-H20 exists', () => {
    const rows = bacWaterCatalogRows([
      { sku: 'BAC-H20', dose: '0mg', displayPrice: 12 },
    ])
    assert.deepEqual(
      rows.map((r) => ({ sku: r.sku, dose: r.dose, displayPrice: r.displayPrice })),
      [
        { sku: BAC_WATER_SKUS.labeled3ml, dose: '3mL', displayPrice: 5 },
        { sku: BAC_WATER_SKUS.labeled10ml, dose: '10mL', displayPrice: 10 },
        { sku: 'BAC-H20', dose: '30mL', displayPrice: 20 },
      ]
    )
  })
})

describe('BAC water checkout upsell', () => {
  it('offers one vial per peptide vial when BAC water is not already in the cart', () => {
    const items = [
      { name: 'BPC-157', sku: 'BPC-10', dose: '10mg', quantity: 4 },
      { name: 'Tesamorelin', sku: 'TES-10', dose: '10mg', quantity: 2 },
    ]
    assert.equal(peptideVialCount(items), 6)
    assert.equal(shouldOfferBacWaterAtCheckout(items), true)
    assert.equal(suggestedBacWaterQty(items), 6)
  })

  it('does not offer when BAC water is already in the cart', () => {
    const items = [
      { name: 'BPC-157', sku: 'BPC-10', dose: '10mg', quantity: 3 },
      { name: 'Bacteriostatic Water', sku: BAC_WATER_SKUS.labeled3ml, dose: '3mL', quantity: 3 },
    ]
    assert.equal(cartHasBacWater(items), true)
    assert.equal(shouldOfferBacWaterAtCheckout(items), false)
  })

  it('does not offer on a BAC-water-only cart', () => {
    const items = [
      { name: 'Bacteriostatic Water', sku: BAC_WATER_SKUS.hospira30ml, dose: '30mL', quantity: 1 },
    ]
    assert.equal(shouldOfferBacWaterAtCheckout(items), false)
    assert.equal(peptideVialCount(items), 0)
  })
})
