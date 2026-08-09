import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getCompoundChemistry } from '../content/compound-chemistry'
import { getBlendComposition } from '../content/blend-compositions'

describe('getCompoundChemistry', () => {
  it('fills screenshot empties with verified CAS / formula / MW', () => {
    const amino = getCompoundChemistry('5-Amino-1MQ')
    assert.equal(amino?.casNumber, '42464-96-0')
    assert.equal(amino?.molecularFormula, 'C10H11N2+')
    assert.equal(amino?.molecularWeight, 159.21)

    const aod = getCompoundChemistry('AOD-9604')
    assert.equal(aod?.casNumber, '221231-10-3')
    assert.equal(aod?.molecularWeight, 1815.1)

    const dsip = getCompoundChemistry('DSIP')
    assert.equal(dsip?.casNumber, '62568-57-4')
    assert.equal(dsip?.molecularFormula, 'C35H48N10O15')

    const kiss = getCompoundChemistry('Kisspeptin')
    assert.equal(kiss?.casNumber, '374675-21-5')
    assert.equal(getCompoundChemistry('Kisspeptin-10')?.casNumber, '374675-21-5')

    const ta1 = getCompoundChemistry('Thymosin alpha-1')
    assert.equal(ta1?.casNumber, '62304-98-7')
    assert.equal(ta1?.molecularWeight, 3108.3)

    assert.equal(getCompoundChemistry('Sermorelin Acetate')?.molecularWeight, 3357.9)
    assert.equal(getCompoundChemistry('Ipamorelin')?.casNumber, '170851-70-4')
  })

  it('keeps IGF-1 LR3 sequence mass (not PubChem CAS false hit)', () => {
    const igf = getCompoundChemistry('IGF-1 LR3')
    assert.equal(igf?.molecularWeight, 9117.6)
    assert.equal(igf?.molecularFormula, 'C400H625N111O115S9')
  })

  it('returns null for unknown names and mixtures we refuse to stamp', () => {
    assert.equal(getCompoundChemistry('Thymalin'), null)
    assert.equal(getCompoundChemistry('Cerebrolysin'), null)
    assert.equal(getCompoundChemistry('not-a-real-peptide-xyz'), null)
  })
})

describe('getBlendComposition fingerprints', () => {
  it('resolves BPC/TB naming variants to the two-component blend', () => {
    for (const name of [
      'BPC-157 and TB-500',
      'BPC-157 / TB-500',
      'BPC-157 / TB-500 Blend',
      'BPC-157 and TB-500 Blend',
    ]) {
      const c = getBlendComposition(name)
      assert.deepEqual(
        c?.map((x) => x.name),
        ['BPC-157', 'TB-500'],
        name,
      )
      assert.ok(c?.[0]?.casNumber)
      assert.ok(c?.[1]?.molecularWeight)
    }
  })

  it('resolves Tesamorelin / Ipamorelin blend', () => {
    for (const name of [
      'Tesamorelin and Ipamorelin',
      'Tesamorelin / Ipamorelin',
      'Tesamorelin 10mg / Ipamorelin 5mg Blend',
    ]) {
      const c = getBlendComposition(name)
      assert.deepEqual(
        c?.map((x) => x.name),
        ['Tesamorelin', 'Ipamorelin'],
        name,
      )
    }
  })

  it('does not classify Glow as BPC/TB-only', () => {
    const glow = getBlendComposition('Glow')
    assert.deepEqual(
      glow?.map((c) => c.name),
      ['GHK-Cu', 'BPC-157', 'TB-500'],
    )
  })
})
