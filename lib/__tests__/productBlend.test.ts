import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  composeBlendProduct,
  normalizeBlendAmount,
  parseBlendProduct,
} from '../products/blend'

describe('normalizeBlendAmount', () => {
  it('treats bare numbers as mg', () => {
    assert.equal(normalizeBlendAmount('5'), '5mg')
    assert.equal(normalizeBlendAmount('2.5'), '2.5mg')
  })

  it('normalizes spacing and casing on unit-qualified amounts', () => {
    assert.equal(normalizeBlendAmount('5 MG'), '5mg')
    assert.equal(normalizeBlendAmount('10.0 mg'), '10mg')
    assert.equal(normalizeBlendAmount(''), '')
  })
})

describe('composeBlendProduct', () => {
  it('joins compounds with "and" and doses with " / "', () => {
    assert.deepEqual(
      composeBlendProduct([
        { name: 'BPC-157', amount: '5' },
        { name: 'TB-500', amount: '5mg' },
      ]),
      { name: 'BPC-157 and TB-500', dose: '5mg / 5mg' }
    )
  })

  it('skips empty rows and omits the dose when amounts are incomplete', () => {
    assert.deepEqual(
      composeBlendProduct([
        { name: 'CJC-1295', amount: '5' },
        { name: 'Ipamorelin', amount: '' },
        { name: '', amount: '' },
      ]),
      { name: 'CJC-1295 and Ipamorelin', dose: '' }
    )
  })
})

describe('parseBlendProduct', () => {
  it('parses "and" blends with positional amounts', () => {
    assert.deepEqual(parseBlendProduct('BPC-157 and TB-500', '5mg / 5mg'), [
      { name: 'BPC-157', amount: '5mg' },
      { name: 'TB-500', amount: '5mg' },
    ])
  })

  it('parses slash-style blend names', () => {
    assert.deepEqual(parseBlendProduct('BPC-157 / TB-500 Blend', '5mg / 10mg'), [
      { name: 'BPC-157', amount: '5mg' },
      { name: 'TB-500', amount: '10mg' },
    ])
  })

  it('leaves amounts blank when the dose does not align', () => {
    assert.deepEqual(parseBlendProduct('BPC-157 and TB-500', '10mg'), [
      { name: 'BPC-157', amount: '' },
      { name: 'TB-500', amount: '' },
    ])
  })

  it('returns null for single-compound products', () => {
    assert.equal(parseBlendProduct('Tesamorelin', '10mg'), null)
    assert.equal(parseBlendProduct('CJC-1295 (no DAC)', '5mg'), null)
  })
})
