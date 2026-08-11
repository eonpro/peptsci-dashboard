import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  describeLabelShortfall,
  labelShortfallFromPickList,
  labelShortfallTotal,
  parseLabelShortfall,
  serializeLabelShortfall,
  type LabelShortfallEntry,
} from '../fulfillment/label-shortfall.ts'

const blend: LabelShortfallEntry = {
  productName: 'BPC-157 and TB-500',
  dose: '5mg / 5mg',
  needed: 1,
  short: 1,
}

describe('parseLabelShortfall', () => {
  test('parses the header payload written by the labels route', () => {
    const raw = JSON.stringify([
      { productName: 'BPC-157 and TB-500', dose: '5mg / 5mg', needed: 1, short: 1 },
    ])
    assert.deepEqual(parseLabelShortfall(raw), [blend])
  })

  test('treats a missing or empty header as no shortfall', () => {
    assert.deepEqual(parseLabelShortfall(null), [])
    assert.deepEqual(parseLabelShortfall(''), [])
  })

  test('never throws on malformed JSON or unexpected shapes', () => {
    assert.deepEqual(parseLabelShortfall('{not json'), [])
    assert.deepEqual(parseLabelShortfall('{"a":1}'), [])
    assert.deepEqual(parseLabelShortfall('[{"short":"lots"}]'), [])
  })

  test('drops entries that are not actually short', () => {
    const raw = JSON.stringify([
      { productName: 'NAD+', dose: '1000mg', needed: 3, short: 0 },
      { productName: 'BPC-157 and TB-500', dose: '5mg / 5mg', needed: 1, short: 1 },
    ])
    assert.deepEqual(parseLabelShortfall(raw), [blend])
  })

  test('falls back to a placeholder name when the route omits one', () => {
    const raw = JSON.stringify([{ needed: 2, short: 2 }])
    assert.deepEqual(parseLabelShortfall(raw), [
      { productName: 'Unknown product', dose: null, needed: 2, short: 2 },
    ])
  })
})

describe('serializeLabelShortfall', () => {
  test('round-trips through parseLabelShortfall', () => {
    const entries = [blend, { productName: 'GHK-Cu', dose: null, needed: 3, short: 2 }]
    assert.deepEqual(parseLabelShortfall(serializeLabelShortfall(entries)), entries)
  })

  test('emits an empty header when nothing is short', () => {
    assert.equal(serializeLabelShortfall([]), '')
  })

  test('escapes non-ASCII so the header stays transmittable', () => {
    const raw = serializeLabelShortfall([{ ...blend, productName: 'Café Peptide™' }])
    assert.ok(!/[^\x20-\x7e]/.test(raw), `header not ASCII-safe: ${raw}`)
    assert.equal(parseLabelShortfall(raw)[0].productName, 'Café Peptide™')
  })
})

describe('labelShortfallTotal', () => {
  test('sums the unlabeled vials', () => {
    assert.equal(labelShortfallTotal([blend, { ...blend, productName: 'GHK-Cu', short: 2 }]), 3)
  })

  test('is zero for an empty list', () => {
    assert.equal(labelShortfallTotal([]), 0)
  })
})

describe('describeLabelShortfall', () => {
  test('returns null when nothing is short', () => {
    assert.equal(describeLabelShortfall([]), null)
  })

  test('names the product and dose for a single missing label', () => {
    const msg = describeLabelShortfall([blend])
    assert.ok(msg)
    assert.match(msg, /^1 vial/)
    assert.match(msg, /BPC-157 and TB-500 5mg \/ 5mg/)
  })

  test('pluralizes and lists every short product', () => {
    const msg = describeLabelShortfall([
      blend,
      { ...blend, productName: 'GHK-Cu', dose: '50mg', needed: 3, short: 2 },
    ])
    assert.ok(msg)
    assert.match(msg, /^3 vials/)
    assert.match(msg, /BPC-157 and TB-500 5mg \/ 5mg/)
    assert.match(msg, /GHK-Cu 50mg/)
  })

  test('shows short-of-needed counts when only part of a line is missing', () => {
    const msg = describeLabelShortfall([{ ...blend, needed: 3, short: 2 }])
    assert.ok(msg)
    assert.match(msg, /2 of 3/)
  })

  test('explains the batch requirement so the operator knows the remedy', () => {
    const msg = describeLabelShortfall([blend])
    assert.ok(msg)
    assert.match(msg, /batch/i)
  })

  test('omits the dose when the product has none', () => {
    const msg = describeLabelShortfall([{ ...blend, dose: null }])
    assert.ok(msg)
    assert.match(msg, /BPC-157 and TB-500 \(/)
  })
})

describe('labelShortfallFromPickList', () => {
  test('maps short pick lines onto shortfall entries', () => {
    const entries = labelShortfallFromPickList({
      lines: [
        { productName: 'NAD+', dose: '1000mg', quantityNeeded: 3, shortfall: 0 },
        { productName: 'BPC-157 and TB-500', dose: '5mg / 5mg', quantityNeeded: 1, shortfall: 1 },
      ],
    })
    assert.deepEqual(entries, [blend])
  })

  test('tolerates a missing or empty pick list', () => {
    assert.deepEqual(labelShortfallFromPickList(null), [])
    assert.deepEqual(labelShortfallFromPickList({ lines: [] }), [])
  })

  test('treats a blank dose as no dose', () => {
    const entries = labelShortfallFromPickList({
      lines: [{ productName: 'Retatrutide', dose: '', quantityNeeded: 1, shortfall: 1 }],
    })
    assert.deepEqual(entries, [{ productName: 'Retatrutide', dose: null, needed: 1, short: 1 }])
  })
})
