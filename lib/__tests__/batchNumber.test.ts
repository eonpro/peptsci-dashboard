import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildBatchNumber,
  parseBudParts,
  productPrefix,
  doseCode,
  withCollisionSuffix,
  barcodePayload,
} from '../batch-number.ts'

describe('parseBudParts', () => {
  test('parses YYYY-MM-DD strings', () => {
    assert.deepEqual(parseBudParts('2027-07-11'), { year: '2027', month: '07', day: '11' })
  })

  test('parses MM/DD/YYYY strings', () => {
    assert.deepEqual(parseBudParts('07/11/2027'), { year: '2027', month: '07', day: '11' })
  })

  test('parses Date objects (UTC, no TZ drift)', () => {
    assert.deepEqual(parseBudParts(new Date('2027-07-11T00:00:00.000Z')), {
      year: '2027',
      month: '07',
      day: '11',
    })
  })

  test('throws on invalid input', () => {
    assert.throws(() => parseBudParts('not-a-date'))
  })
})

describe('productPrefix', () => {
  test('takes first three letters uppercased', () => {
    assert.equal(productPrefix('Tesamorelin'), 'TES')
    assert.equal(productPrefix('semaglutide'), 'SEM')
  })

  test('strips non-alpha then slices', () => {
    assert.equal(productPrefix('BPC-157'), 'BPC')
    assert.equal(productPrefix('NAD+ Nasal'), 'NAD')
  })

  test('pads short names with X', () => {
    assert.equal(productPrefix('AB'), 'ABX')
    assert.equal(productPrefix(''), 'XXX')
  })
})

describe('doseCode', () => {
  test('extracts integer mg', () => {
    assert.equal(doseCode('10mg'), '10')
    assert.equal(doseCode('100mg/mL'), '100')
  })

  test('removes decimal point', () => {
    assert.equal(doseCode('2.5mg'), '25')
  })

  test('defaults to 0 when no number', () => {
    assert.equal(doseCode('mg'), '0')
  })
})

describe('buildBatchNumber', () => {
  test('matches the confirmed example TES10-072027', () => {
    assert.equal(
      buildBatchNumber({ name: 'Tesamorelin', dose: '10mg', bud: '2027-07-11' }),
      'TES10-072027'
    )
  })

  test('matches the sample-artwork example TES10-102027', () => {
    // Sample label artwork: BUD 10/07/2027 -> month 10, year 2027.
    assert.equal(
      buildBatchNumber({ name: 'Tesamorelin', dose: '10mg', bud: '2027-10-07' }),
      'TES10-102027'
    )
  })

  test('works with Date inputs and decimal doses', () => {
    assert.equal(
      buildBatchNumber({
        name: 'Semaglutide',
        dose: '2.5mg',
        bud: new Date('2026-01-31T00:00:00.000Z'),
      }),
      'SEM25-012026'
    )
  })
})

describe('withCollisionSuffix', () => {
  test('first attempt is the base, later attempts append -N', () => {
    assert.equal(withCollisionSuffix('TES10-072027', 1), 'TES10-072027')
    assert.equal(withCollisionSuffix('TES10-072027', 2), 'TES10-072027-2')
    assert.equal(withCollisionSuffix('TES10-072027', 3), 'TES10-072027-3')
  })
})

describe('barcodePayload', () => {
  test('uppercases and trims the batch number', () => {
    assert.equal(barcodePayload('  tes10-072027 '), 'TES10-072027')
  })
})
