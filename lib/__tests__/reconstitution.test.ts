import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  calculateReconstitution,
  doseMcgToSyringeUnits,
  formatDoseRangeAsSyringeUnits,
  formatReconNumber,
  isReconstitutableProduct,
  parseTotalVialMg,
  syringeUnitsToDoseMcg,
} from '../reconstitution'

describe('parseTotalVialMg', () => {
  it('parses single and blend dose strings', () => {
    assert.equal(parseTotalVialMg('10mg'), 10)
    assert.equal(parseTotalVialMg('10 mg'), 10)
    assert.equal(parseTotalVialMg('10mg/10mg'), 20)
    assert.equal(parseTotalVialMg('5mg/5mg/50mg'), 60)
    assert.equal(parseTotalVialMg(null), 0)
    assert.equal(parseTotalVialMg(''), 0)
  })
})

describe('calculateReconstitution', () => {
  it('matches crestpep BPC/TB example (10 mg / 2 ml / 250 mcg → 5 units)', () => {
    const r = calculateReconstitution({ vialMg: 10, waterMl: 2, desiredDoseMcg: 250 })
    assert.ok(r)
    assert.equal(r!.concentrationMgPerMl, 5)
    assert.equal(r!.injectionVolumeMl, 0.05)
    assert.equal(r!.syringeUnits, 5)
    assert.equal(r!.dosesPerVial, 40)
  })

  it('returns null for invalid inputs', () => {
    assert.equal(calculateReconstitution({ vialMg: 0, waterMl: 2, desiredDoseMcg: 250 }), null)
    assert.equal(calculateReconstitution({ vialMg: 10, waterMl: 0, desiredDoseMcg: 250 }), null)
    assert.equal(calculateReconstitution({ vialMg: 10, waterMl: 2, desiredDoseMcg: 0 }), null)
  })
})

describe('formatReconNumber', () => {
  it('formats integers without trailing .0', () => {
    assert.equal(formatReconNumber(5), '5')
    assert.equal(formatReconNumber(5.04), '5')
    assert.equal(formatReconNumber(5.25), '5.3')
  })
})

describe('doseMcgToSyringeUnits / syringeUnitsToDoseMcg', () => {
  it('AOD-9604 at recommended recon: 5 mg / 2 ml / 300 mcg → 12 units', () => {
    assert.equal(doseMcgToSyringeUnits(300, 5, 2), 12)
    assert.equal(syringeUnitsToDoseMcg(12, 5, 2), 300)
  })

  it('round-trips with calculateReconstitution', () => {
    const mcg = 250
    const units = doseMcgToSyringeUnits(mcg, 10, 2)
    assert.equal(units, 5)
    assert.equal(syringeUnitsToDoseMcg(units!, 10, 2), mcg)
  })
})

describe('formatDoseRangeAsSyringeUnits', () => {
  it('converts mcg daily range at recommended recon (AOD 5 mg / 2 ml)', () => {
    assert.equal(formatDoseRangeAsSyringeUnits('300–500 mcg', 5, 2), '12–20 units')
  })

  it('converts mg weekly range and preserves "total" suffix', () => {
    assert.equal(formatDoseRangeAsSyringeUnits('1.75–3.5 mg total', 10, 2), '35–70 units total')
  })

  it('leaves IU / N/A ranges alone', () => {
    assert.equal(formatDoseRangeAsSyringeUnits('250–500 IU', 5, 1), null)
    assert.equal(formatDoseRangeAsSyringeUnits('N/A', 5, 2), null)
  })
})

describe('isReconstitutableProduct', () => {
  it('excludes BAC water and accessories', () => {
    assert.equal(isReconstitutableProduct('Bacteriostatic Water'), false)
    assert.equal(isReconstitutableProduct('BAC Water 30ml'), false)
    assert.equal(isReconstitutableProduct('BPC-157'), true)
    assert.equal(isReconstitutableProduct('BPC-157 / TB-500 Blend'), true)
    assert.equal(isReconstitutableProduct('Syringes', 'Accessories'), false)
  })
})
