import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  getCompoundParts,
  getProductDisplayImage,
  isBacteriostaticWaterProduct,
  BACTERIOSTATIC_WATER_IMAGE,
  vialDoseBands,
  vialDoseParts,
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

  it('keeps all GLOW/KLOW compounds from the catalog breakdown', () => {
    const glow = getCompoundParts({
      name: 'GLOW',
      dose: '50mg/10mg/10mg',
      compounds: [
        { name: 'GHK-Cu', amount: '50mg' },
        { name: 'BPC-157', amount: '10mg' },
        { name: 'TB-500', amount: '10mg' },
      ],
    })
    assert.deepEqual(
      glow.map((c) => `${c.name} ${c.dose}`),
      ['GHK-Cu 50mg', 'BPC-157 10mg', 'TB-500 10mg']
    )

    const klow = getCompoundParts({
      name: 'KLOW',
      dose: '80mg',
      compounds: [
        { name: 'GHK-Cu', amount: '50mg' },
        { name: 'BPC-157', amount: '10mg' },
        { name: 'KPV', amount: '10mg' },
        { name: 'TB-500', amount: '10mg' },
      ],
    })
    assert.equal(klow.length, 4)
    assert.equal(klow[2].name, 'KPV')
  })
})

describe('vialDoseBands', () => {
  it('puts the first GLOW dose in the black band and the rest in blue', () => {
    assert.deepEqual(vialDoseBands(['50mg', '10mg', '10mg']), {
      top: '50mg',
      bottom: '10mg/10mg',
    })
  })

  it('joins all remaining KLOW doses in the blue band', () => {
    assert.deepEqual(vialDoseBands(['50mg', '10mg', '10mg', '10mg']), {
      top: '50mg',
      bottom: '10mg/10mg/10mg',
    })
  })
})

describe('vialDoseParts', () => {
  it('uses per-compound amounts when the catalog lists every peptide', () => {
    const compounds = [
      { name: 'GHK-Cu', dose: '50mg' },
      { name: 'BPC-157', dose: '10mg' },
      { name: 'TB-500', dose: '10mg' },
    ]
    assert.deepEqual(vialDoseParts({ name: 'GLOW', dose: '70mg' }, compounds), [
      '50mg',
      '10mg',
      '10mg',
    ])
  })

  it('splits a slash dose when the line item is only the trade name', () => {
    assert.deepEqual(
      vialDoseParts({ name: 'KLOW', dose: '50mg/10mg/10mg/10mg' }, [{ name: 'KLOW', dose: '50mg/10mg/10mg/10mg' }]),
      ['50mg', '10mg', '10mg', '10mg']
    )
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
