import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  calculateReconstitution,
  formatReconNumber,
  isReconstitutableProduct,
  parseTotalVialMg,
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

describe('isReconstitutableProduct', () => {
  it('excludes BAC water and accessories', () => {
    assert.equal(isReconstitutableProduct('Bacteriostatic Water'), false)
    assert.equal(isReconstitutableProduct('BAC Water 30ml'), false)
    assert.equal(isReconstitutableProduct('BPC-157'), true)
    assert.equal(isReconstitutableProduct('BPC-157 / TB-500 Blend'), true)
    assert.equal(isReconstitutableProduct('Syringes', 'Accessories'), false)
  })
})
