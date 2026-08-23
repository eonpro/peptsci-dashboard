import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  compoundListSubtitle,
  displayProductAka,
  displayProductName,
  looksLikeCompoundList,
  namedBlendCardDose,
  namedBlendCompoundSubtitle,
  namedBlendFromCompounds,
  namedBlendSkuKey,
  resolveNamedBlendTradeName,
  displayCatalogDose,
  sumSlashMgDose,
} from '../products/named-blends'
import { getBlendComposition, resolveBlendCompounds } from '../content/blend-compositions'

describe('looksLikeCompoundList', () => {
  it('detects and-joined and slash-joined names', () => {
    assert.equal(looksLikeCompoundList('GHK-Cu and BPC-157 and TB-500'), true)
    assert.equal(looksLikeCompoundList('BPC-157 / TB-500 Blend'), true)
    assert.equal(looksLikeCompoundList('GLOW'), false)
    assert.equal(looksLikeCompoundList('Glow'), false)
  })
})

describe('namedBlendSkuKey', () => {
  it('strips trailing size suffixes for GLOW/KLOW', () => {
    assert.equal(namedBlendSkuKey('GLOW'), 'glow')
    assert.equal(namedBlendSkuKey('GLOW-70'), 'glow')
    assert.equal(namedBlendSkuKey('klow-80'), 'klow')
    assert.equal(namedBlendSkuKey('GHK-50'), null)
  })
})

describe('resolveNamedBlendTradeName', () => {
  it('maps the Elevated Vitality GLOW row to GLOW', () => {
    assert.equal(
      resolveNamedBlendTradeName('GHK-Cu and BPC-157 and TB-500', 'GLOW'),
      'GLOW'
    )
    assert.equal(displayProductName('GHK-Cu and BPC-157 and TB-500', 'GLOW'), 'GLOW')
  })

  it('maps KLOW 80 (GHK 50 / BPC 10 / TB 10 / KPV 10) to KLOW', () => {
    assert.equal(
      resolveNamedBlendTradeName(
        'GHK-Cu and BPC-157 and TB-500 and KPV',
        'KLOW'
      ),
      'KLOW'
    )
    assert.equal(
      displayProductName('GHK-Cu and BPC-157 and TB-500 and KPV', 'KLOW-80'),
      'KLOW'
    )
    assert.equal(displayProductName('Klow', 'KLOW-80'), 'KLOW')
    assert.equal(displayProductAka('Klow', 'KLOW-80', null), namedBlendCompoundSubtitle('KLOW'))
    assert.equal(namedBlendCompoundSubtitle('KLOW'), 'GHK-Cu / BPC-157 / KPV / TB-500')
  })

  it('maps compound fingerprints without relying on SKU', () => {
    assert.equal(namedBlendFromCompounds('GHK-Cu and BPC-157 and TB-500'), 'GLOW')
    assert.equal(
      namedBlendFromCompounds('BPC-157 and TB-500 and GHK-Cu and KPV'),
      'KLOW'
    )
  })

  it('normalizes Glow/Klow trade names to GLOW/KLOW', () => {
    assert.equal(resolveNamedBlendTradeName('GLOW', 'GLOW'), 'GLOW')
    assert.equal(resolveNamedBlendTradeName('Glow', 'GLOW-70'), 'GLOW')
    assert.equal(displayProductName('Glow', 'GLOW-70'), 'GLOW')
    assert.equal(displayProductName('Klow 80', null), 'KLOW')
  })

  it('fills aka from the compound list when promoting the name', () => {
    assert.equal(
      displayProductAka('GHK-Cu and BPC-157 and TB-500', 'GLOW', null),
      'GHK-Cu / BPC-157 / TB-500'
    )
    assert.equal(
      displayProductAka('GHK-Cu and BPC-157 and TB-500', 'GLOW', 'Glow blend'),
      'Glow blend'
    )
    assert.equal(compoundListSubtitle('BPC-157 / TB-500 Blend'), 'BPC-157 / TB-500')
  })

  it('aligns blend composition with on-label compound order', () => {
    const glow = getBlendComposition('GLOW')
    const klow = getBlendComposition('KLOW')
    assert.deepEqual(
      glow?.map((c) => c.name),
      ['GHK-Cu', 'BPC-157', 'TB-500']
    )
    assert.deepEqual(
      klow?.map((c) => c.name),
      ['GHK-Cu', 'BPC-157', 'KPV', 'TB-500']
    )
  })
})

describe('resolveBlendCompounds', () => {
  it('lists all three GLOW peptides with slash-dose amounts', () => {
    const glow = resolveBlendCompounds('GLOW', '50mg/10mg/10mg')
    assert.deepEqual(
      glow?.map((c) => `${c.name} ${c.amount}`),
      ['GHK-Cu 50mg', 'BPC-157 10mg', 'TB-500 10mg']
    )
  })

  it('fills canonical GLOW amounts when the variant dose is a 70mg total', () => {
    const glow = resolveBlendCompounds('GLOW', '70mg')
    assert.deepEqual(
      glow?.map((c) => `${c.name} ${c.amount}`),
      ['GHK-Cu 50mg', 'BPC-157 10mg', 'TB-500 10mg']
    )
  })

  it('lists all four KLOW peptides, including from an 80mg total dose', () => {
    const fromParts = resolveBlendCompounds('KLOW', '50mg/10mg/10mg/10mg')
    const fromTotal = resolveBlendCompounds('KLOW', '80mg')
    const expected = ['GHK-Cu 50mg', 'BPC-157 10mg', 'KPV 10mg', 'TB-500 10mg']
    assert.deepEqual(
      fromParts?.map((c) => `${c.name} ${c.amount}`),
      expected
    )
    assert.deepEqual(
      fromTotal?.map((c) => `${c.name} ${c.amount}`),
      expected
    )
  })
})

describe('namedBlendCardDose', () => {
  it('sums GLOW and KLOW slash doses to the vial total', () => {
    assert.equal(sumSlashMgDose('50mg/10mg/10mg'), '70mg')
    assert.equal(sumSlashMgDose('50mg/10mg/10mg/10mg'), '80mg')
    assert.equal(namedBlendCardDose('GLOW', 'GLOW-70', '50mg/10mg/10mg'), '70mg')
    assert.equal(namedBlendCardDose('KLOW', 'KLOW-80', '50mg/10mg/10mg/10mg'), '80mg')
  })

  it('leaves Semax and other singles unchanged', () => {
    assert.equal(namedBlendCardDose('Semax', 'SEMAX-10MG', '10mg'), '10mg')
    assert.equal(namedBlendCardDose('GHK-Cu', 'GHK-50', '50mg'), '50mg')
  })
})

describe('displayCatalogDose', () => {
  it('shows the 10mg Semax we stock, not the leftover 30mg SKU label', () => {
    assert.equal(displayCatalogDose('Semax', 'SEMAX-30MG', '30mg'), '10mg')
    assert.equal(displayCatalogDose('Semax', 'SEMAX-10MG', '10mg'), '10mg')
  })
})
