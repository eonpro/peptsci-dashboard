import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  assayClaimCaption,
  blendBanner,
  blendComponentsForCoa,
  coverBlendComponents,
  milligramsFromDoseLabel,
  planOrderCoaPack,
  prefillFromBlendPart,
} from '../coa-blend'

describe('milligramsFromDoseLabel', () => {
  it('reads a single-compound dose', () => {
    assert.equal(milligramsFromDoseLabel('5mg'), 5)
    assert.equal(milligramsFromDoseLabel('5 mg'), 5)
    assert.equal(milligramsFromDoseLabel('10.0 MG'), 10)
    assert.equal(milligramsFromDoseLabel('5'), 5)
  })

  it('refuses a blend dose so 10mg/5mg is never treated as 15mg', () => {
    assert.equal(milligramsFromDoseLabel('10mg / 5mg'), null)
    assert.equal(milligramsFromDoseLabel('10mg/5mg'), null)
    assert.equal(milligramsFromDoseLabel('10mg and 5mg'), null)
    assert.equal(milligramsFromDoseLabel(''), null)
    assert.equal(milligramsFromDoseLabel(null), null)
  })
})

describe('blendComponentsForCoa', () => {
  it('splits Tesamorelin / Ipamorelin into per-peptide amounts', () => {
    const parts = blendComponentsForCoa('Tesamorelin and Ipamorelin', '10mg / 5mg')
    assert.deepEqual(
      parts?.map((p) => ({ name: p.name, amount: p.amount, mg: p.labelClaimMg })),
      [
        { name: 'Tesamorelin', amount: '10mg', mg: 10 },
        { name: 'Ipamorelin', amount: '5mg', mg: 5 },
      ]
    )
  })

  it('returns null for a single peptide', () => {
    assert.equal(blendComponentsForCoa('Ipamorelin', '5mg'), null)
  })
})

describe('prefillFromBlendPart', () => {
  it('fills compound, dose, and that peptide\'s label claim — not the vial total', () => {
    const parts = blendComponentsForCoa('Tesamorelin and Ipamorelin', '10mg / 5mg')
    const ipa = parts?.find((p) => p.name === 'Ipamorelin')
    assert.ok(ipa)
    const prefill = prefillFromBlendPart(ipa)
    assert.equal(prefill.compoundName, 'Ipamorelin')
    assert.equal(prefill.doseLabel, '5mg')
    assert.equal(prefill.assayLabelClaimMg, '5')
    assert.equal(prefill.identitySpec, 'Ipamorelin')
    assert.equal(prefill.identityResult, 'Ipamorelin')
  })
})

describe('assayClaimCaption', () => {
  it('states percent of that peptide\'s claim, not a 15mg vial total', () => {
    assert.equal(
      assayClaimCaption({
        compoundName: 'Ipamorelin',
        measuredMg: 5.93,
        labelClaimMg: 5,
      }),
      'Of Ipamorelin 5 mg claim · 5.93 mg'
    )
    assert.equal(
      assayClaimCaption({
        compoundName: 'Tesamorelin',
        measuredMg: 9.97,
        labelClaimMg: 10,
      }),
      'Of Tesamorelin 10 mg claim · 9.97 mg'
    )
  })
})

describe('blendBanner', () => {
  it('names the vial and marks which component this page is', () => {
    const parts = blendComponentsForCoa('Tesamorelin and Ipamorelin', '10mg / 5mg')
    assert.ok(parts)
    const banner = blendBanner({
      productName: 'Tesamorelin and Ipamorelin',
      dose: '10mg / 5mg',
      parts,
      thisCompound: 'Ipamorelin',
    })
    assert.match(banner, /component of tesamorelin and ipamorelin/i)
    assert.match(banner, /10mg \/ 5mg/i)
    assert.match(banner, /this page: ipamorelin/i)
  })
})

describe('coverBlendComponents', () => {
  it('flags the missing Tesamorelin certificate on a 10mg/5mg blend', () => {
    const parts = blendComponentsForCoa('Tesamorelin and Ipamorelin', '10mg / 5mg')
    assert.ok(parts)
    const coverage = coverBlendComponents(parts, [
      { compoundName: 'Ipamorelin', assayMeasuredMg: 5.93, assayLabelClaimMg: 5, purityPercent: 99.77 },
    ])
    assert.equal(coverage.matched.length, 1)
    assert.equal(coverage.matched[0]?.part.name, 'Ipamorelin')
    assert.deepEqual(
      coverage.missing.map((p) => p.name),
      ['Tesamorelin']
    )
  })

  it('sorts certificates into blend order', () => {
    const parts = blendComponentsForCoa('Tesamorelin and Ipamorelin', '10mg / 5mg')
    assert.ok(parts)
    const coverage = coverBlendComponents(parts, [
      { compoundName: 'Ipamorelin', id: 'ipa' },
      { compoundName: 'Tesamorelin', id: 'tesa' },
    ])
    assert.deepEqual(
      coverage.matched.map((m) => m.coa.id),
      ['tesa', 'ipa']
    )
  })
})

describe('planOrderCoaPack', () => {
  it('prints every component certificate and warns when a blend peptide is missing', () => {
    const pack = planOrderCoaPack([
      {
        productName: 'Tesamorelin and Ipamorelin',
        dose: '10mg / 5mg',
        quantity: 2,
        coas: [
          { id: 'ipa', compoundName: 'Ipamorelin' },
          { id: 'tesa', compoundName: 'Tesamorelin' },
        ],
      },
      {
        productName: 'BPC-157 and TB-500',
        dose: '5mg / 5mg',
        quantity: 1,
        coas: [{ id: 'bpc', compoundName: 'BPC-157' }],
      },
    ])
    assert.deepEqual(
      pack.pages.map((c) => c.id),
      ['tesa', 'ipa', 'bpc']
    )
    assert.equal(pack.pageCount, 3)
    assert.match(pack.warnings.join(' '), /TB-500/i)
  })
})
