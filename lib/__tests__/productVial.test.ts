import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  getCompoundParts,
  getProductDisplayImage,
  isBacteriostaticWaterProduct,
  BACTERIOSTATIC_WATER_IMAGE,
  namedBlendFaceDose,
  vialDoseBands,
  vialDoseParts,
  vialPowderColor,
} from '@/components/shop/ProductVial'

describe('vialPowderColor', () => {
  it('is purple for GHK-Cu and the GLOW/KLOW blends that contain it', () => {
    assert.equal(vialPowderColor('GHK-Cu'), 'purple')
    assert.equal(vialPowderColor('GHK Cu 50mg'), 'purple')
    assert.equal(vialPowderColor('Copper Peptide GHK'), 'purple')
    assert.equal(vialPowderColor('GLOW', 'GLOW-70'), 'purple')
    assert.equal(vialPowderColor('KLOW', 'KLOW-80'), 'purple')
    assert.equal(vialPowderColor('GHK-Cu / BPC-157 / TB-500 Blend', 'GLOW-70'), 'purple')
  })

  it('is orange for 5-Amino-1MQ in any spelling', () => {
    assert.equal(vialPowderColor('5-Amino-1MQ'), 'orange')
    assert.equal(vialPowderColor('5 Amino 1MQ 50mg'), 'orange')
    assert.equal(vialPowderColor('5-AMINO-1MQ', '5A1MQ-50'), 'orange')
  })

  it('is white for everything else', () => {
    assert.equal(vialPowderColor('BPC-157'), 'white')
    assert.equal(vialPowderColor('Semax', 'SEMAX-10MG'), 'white')
    assert.equal(vialPowderColor('CJC-1295 (no DAC)'), 'white')
    assert.equal(vialPowderColor('Bacteriostatic Water'), 'white')
  })
})

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
  it('splits a two-peptide blend across black and blue bands', () => {
    assert.deepEqual(vialDoseBands(['10mg', '10mg']), {
      top: '10mg',
      bottom: '10mg',
    })
  })

  it('joins leftover parts in the blue band for unlabeled blends', () => {
    assert.deepEqual(vialDoseBands(['5mg', '5mg', '5mg']), {
      top: '5mg',
      bottom: '5mg/5mg',
    })
  })
})

describe('namedBlendFaceDose', () => {
  it('prints GLOW as 70mg, not the GHK 50mg plus leftover milligrams', () => {
    assert.equal(
      namedBlendFaceDose({
        name: 'GLOW',
        sku: 'GLOW-70',
        dose: '50mg/10mg/10mg',
        compounds: [
          { name: 'GHK-Cu', amount: '50mg' },
          { name: 'BPC-157', amount: '10mg' },
          { name: 'TB-500', amount: '10mg' },
        ],
      }),
      '70mg'
    )
  })

  it('prints KLOW as 80mg, not the GHK 50mg plus leftover milligrams', () => {
    assert.equal(
      namedBlendFaceDose({
        name: 'KLOW',
        sku: 'KLOW-80',
        dose: '50mg/10mg/10mg/10mg',
        compounds: [
          { name: 'GHK-Cu', amount: '50mg' },
          { name: 'BPC-157', amount: '10mg' },
          { name: 'KPV', amount: '10mg' },
          { name: 'TB-500', amount: '10mg' },
        ],
      }),
      '80mg'
    )
  })

  it('does not rewrite a single-peptide dose', () => {
    assert.equal(namedBlendFaceDose({ name: 'Semax', sku: 'SEMAX-10MG', dose: '10mg' }), null)
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
