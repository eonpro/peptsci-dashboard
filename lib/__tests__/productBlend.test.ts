import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  composeBlendProduct,
  normalizeBlendAmount,
  parseBlendProduct,
  resolveBlendEditState,
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

describe('resolveBlendEditState', () => {
  it('reopens compound-list names in blend mode', () => {
    const state = resolveBlendEditState('BPC-157 and TB-500', '5mg / 5mg')
    assert.deepEqual(state, {
      components: [
        { name: 'BPC-157', amount: '5mg' },
        { name: 'TB-500', amount: '5mg' },
      ],
      blendName: '',
    })
  })

  it('reopens named GLOW/KLOW trade names from aka compounds', () => {
    const state = resolveBlendEditState(
      'GLOW',
      '20mg / 10mg / 10mg',
      'GHK-Cu / BPC-157 / TB-500',
      'GLOW-70'
    )
    assert.ok(state)
    assert.equal(state!.blendName, 'GLOW')
    assert.equal(state!.components.length, 3)
    assert.equal(state!.components[0].name, 'GHK-Cu')
  })

  it('does not treat a single peptide aka subtitle as a blend', () => {
    // Retatrutide is one peptide; the aka lists receptor pathways, not
    // separate compounds in the vial.
    assert.equal(
      resolveBlendEditState(
        'Retatrutide',
        '5mg',
        'GLP-1 / GIP / Glucagon Triple Agonist',
        'RT5'
      ),
      null
    )
    assert.equal(
      resolveBlendEditState('Retatrutide', '', 'GLP-1 / GIP / Glucagon Triple Agonist', 'RT5'),
      null
    )
  })
})
