import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeDoseLabel, splitProductNameLines, NAME_TRACKING_EM } from '../labels/peptsciLabelPdf'

describe('normalizeDoseLabel', () => {
  it('strips trailing .0 decimals', () => {
    assert.equal(normalizeDoseLabel('10.0 mg'), '10mg')
    assert.equal(normalizeDoseLabel('60.00mg'), '60mg')
  })

  it('removes the space between the number and the unit', () => {
    assert.equal(normalizeDoseLabel('5 mg'), '5mg')
    assert.equal(normalizeDoseLabel('10 MG'), '10mg')
  })

  it('treats a bare number as mg', () => {
    assert.equal(normalizeDoseLabel('10'), '10mg')
    assert.equal(normalizeDoseLabel('10.0'), '10mg')
  })

  it('keeps meaningful fractional doses', () => {
    assert.equal(normalizeDoseLabel('2.5mg'), '2.5mg')
    assert.equal(normalizeDoseLabel('2.50 mg'), '2.5mg')
  })

  it('normalizes every dose in a blend string', () => {
    assert.equal(normalizeDoseLabel('5.0 mg / 5.0 mg'), '5mg / 5mg')
  })

  it('leaves already-clean values untouched', () => {
    assert.equal(normalizeDoseLabel('10mg'), '10mg')
  })
})

describe('splitProductNameLines', () => {
  it('breaks before "and" for blend names', () => {
    assert.deepEqual(splitProductNameLines('CJC-1295 and Ipamorelin'), [
      'CJC-1295',
      'and Ipamorelin',
    ])
  })

  it('converts slash-style blend names to the "and" artwork format', () => {
    assert.deepEqual(splitProductNameLines('BPC-157 / TB-500 Blend'), ['BPC-157', 'and TB-500'])
    assert.deepEqual(splitProductNameLines('Tesamorelin / Ipamorelin'), [
      'Tesamorelin',
      'and Ipamorelin',
    ])
  })

  it('breaks before a trailing parenthetical', () => {
    assert.deepEqual(splitProductNameLines('CJC-1295 (no DAC)'), ['CJC-1295', '(no DAC)'])
  })

  it('breaks multi-word names at the space nearest the middle', () => {
    assert.deepEqual(splitProductNameLines('Thymosin Beta 4 Fragment'), [
      'Thymosin Beta',
      '4 Fragment',
    ])
  })

  it('keeps single-word names on one line', () => {
    assert.deepEqual(splitProductNameLines('BPC-157'), ['BPC-157'])
  })
})

describe('NAME_TRACKING_EM', () => {
  it('matches Illustrator tracking −25 (thousandths of an em)', () => {
    assert.equal(NAME_TRACKING_EM, -0.025)
  })
})
