import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatElevatedVitalityDose,
  splitElevatedVitalityNameLines,
} from '../labels/elevatedVitalityLabelPdf'
import { isLabelBrandKey, resolveLabelBrandKey } from '../labels/brandKeys'

describe('Elevated Vitality name/dose overlay helpers', () => {
  it('splits slash blends into two lines without "and"', () => {
    assert.deepEqual(splitElevatedVitalityNameLines('BPC-157 / TB-500'), ['BPC-157', 'TB-500'])
    assert.deepEqual(splitElevatedVitalityNameLines('BPC-157 / TB-500 Blend'), [
      'BPC-157',
      'TB-500',
    ])
  })

  it('splits "and" / "&" blends into two lines', () => {
    assert.deepEqual(splitElevatedVitalityNameLines('Tesamorelin and Ipamorelin'), [
      'Tesamorelin',
      'Ipamorelin',
    ])
    assert.deepEqual(splitElevatedVitalityNameLines('TESAMORELIN & IPAMORELIN'), [
      'TESAMORELIN',
      'IPAMORELIN',
    ])
  })

  it('keeps single compounds on one line', () => {
    assert.deepEqual(splitElevatedVitalityNameLines('Tesamorelin'), ['Tesamorelin'])
  })

  it('formats blend doses as dose/dose when needed', () => {
    assert.equal(formatElevatedVitalityDose('10mg', ['BPC-157', 'TB-500']), '10MG/10MG')
    assert.equal(formatElevatedVitalityDose('10mg/5mg', ['A', 'B']), '10MG/5MG')
    assert.equal(formatElevatedVitalityDose('10mg', ['TESAMORELIN']), '10MG')
  })
})

describe('resolveLabelBrandKey', () => {
  it('returns null unless white-label is enabled with a known brand', () => {
    assert.equal(
      resolveLabelBrandKey({ whiteLabelEnabled: false, labelBrandKey: 'elevated_vitality' }),
      null
    )
    assert.equal(resolveLabelBrandKey({ whiteLabelEnabled: true, labelBrandKey: null }), null)
    assert.equal(resolveLabelBrandKey({ whiteLabelEnabled: true, labelBrandKey: 'nope' }), null)
    assert.equal(
      resolveLabelBrandKey({ whiteLabelEnabled: true, labelBrandKey: 'elevated_vitality' }),
      'elevated_vitality'
    )
  })

  it('validates brand keys', () => {
    assert.equal(isLabelBrandKey('elevated_vitality'), true)
    assert.equal(isLabelBrandKey('peptsci'), false)
  })
})
