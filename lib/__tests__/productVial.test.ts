import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  getCompoundParts,
  getProductDisplayImage,
  isBacteriostaticWaterProduct,
  BACTERIOSTATIC_WATER_IMAGE,
} from '@/components/shop/ProductVial'

describe('getCompoundParts', () => {
  it('uses name + dose for a single peptide line item', () => {
    const parts = getCompoundParts({ name: 'LL-37', dose: '5.0mg' })
    assert.deepEqual(parts, [{ name: 'LL-37', dose: '5.0mg' }])
  })

  it('splits blend names joined with "and"', () => {
    const parts = getCompoundParts({ name: 'BPC-157 and TB-500', dose: '10mg/10mg' })
    assert.equal(parts.length, 2)
    assert.equal(parts[0].name, 'BPC-157')
    assert.equal(parts[1].name, 'TB-500')
    assert.equal(parts[0].dose, '10mg')
    assert.equal(parts[1].dose, '10mg')
  })
})

describe('bacteriostatic water display image', () => {
  it('detects bacteriostatic / BAC water names', () => {
    assert.equal(isBacteriostaticWaterProduct('Bacteriostatic Water'), true)
    assert.equal(isBacteriostaticWaterProduct('BAC Water 30ml'), true)
    assert.equal(isBacteriostaticWaterProduct('BAC-H2O'), true)
    assert.equal(isBacteriostaticWaterProduct('BPC-157'), false)
  })

  it('returns the dedicated photo for BAC water only', () => {
    assert.equal(getProductDisplayImage('Bacteriostatic Water'), BACTERIOSTATIC_WATER_IMAGE)
    assert.equal(getProductDisplayImage('Retatrutide'), null)
  })
})
