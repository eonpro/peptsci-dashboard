import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { parseLocaleNumber, coerceCurrency, coerceDate } from '../csv-coerce.ts'

describe('parseLocaleNumber', () => {
  test('US format: comma thousands, dot decimal', () => {
    assert.equal(parseLocaleNumber('1,234.56'), 1234.56)
    assert.equal(parseLocaleNumber('12,345,678.90'), 12345678.9)
  })

  test('EU format: dot thousands, comma decimal', () => {
    assert.equal(parseLocaleNumber('1.234,56'), 1234.56)
    assert.equal(parseLocaleNumber('12.345.678,90'), 12345678.9)
  })

  test('currency symbols and spaces are stripped', () => {
    assert.equal(parseLocaleNumber('$1,234.50'), 1234.5)
    assert.equal(parseLocaleNumber('$ 1 234,56'), 1234.56)
    assert.equal(parseLocaleNumber('1234.56 USD'), 1234.56)
  })

  test('single comma with 1-2 decimals is a decimal separator', () => {
    assert.equal(parseLocaleNumber('12,5'), 12.5)
    assert.equal(parseLocaleNumber('12,50'), 12.5)
  })

  test('single comma with 3 digits is a thousands separator', () => {
    assert.equal(parseLocaleNumber('1,234'), 1234)
  })

  test('plain numbers and negatives', () => {
    assert.equal(parseLocaleNumber('899.00'), 899)
    assert.equal(parseLocaleNumber('-1,234.56'), -1234.56)
  })

  test('blank -> undefined, garbage -> NaN', () => {
    assert.equal(parseLocaleNumber(''), undefined)
    assert.equal(parseLocaleNumber('   '), undefined)
    assert.equal(parseLocaleNumber(null), undefined)
    assert.equal(parseLocaleNumber(undefined), undefined)
    assert.ok(Number.isNaN(parseLocaleNumber('abc') as number))
  })
})

describe('coerceCurrency', () => {
  test('parses both locale conventions, 0 when blank/invalid', () => {
    assert.equal(coerceCurrency('$1,234.50'), 1234.5)
    assert.equal(coerceCurrency('1.234,50'), 1234.5)
    assert.equal(coerceCurrency(''), 0)
    assert.equal(coerceCurrency('abc'), 0)
  })
})

describe('coerceDate', () => {
  test('bare ISO date is an America/New_York calendar day (EST)', () => {
    const d = coerceDate('2026-01-15')
    assert.ok(d)
    // NY midnight in January = 05:00 UTC
    assert.equal(d!.toISOString(), '2026-01-15T05:00:00.000Z')
  })

  test('MM/DD/YYYY parses month-first (US)', () => {
    const d = coerceDate('1/15/2026')
    assert.ok(d)
    assert.equal(d!.toISOString(), '2026-01-15T05:00:00.000Z')
    // 02/03/2026 must be Feb 3, not Mar 2.
    const ambiguous = coerceDate('02/03/2026')
    assert.equal(ambiguous!.toISOString(), '2026-02-03T05:00:00.000Z')
  })

  test('DST: NY midnight in July = 04:00 UTC', () => {
    const d = coerceDate('7/4/2026')
    assert.ok(d)
    assert.equal(d!.toISOString(), '2026-07-04T04:00:00.000Z')
  })

  test('full timestamps keep their exact instant', () => {
    const d = coerceDate('2026-01-15T12:30:00Z')
    assert.ok(d)
    assert.equal(d!.toISOString(), '2026-01-15T12:30:00.000Z')
  })

  test('invalid/blank -> null', () => {
    assert.equal(coerceDate('not a date'), null)
    assert.equal(coerceDate(''), null)
    assert.equal(coerceDate(null), null)
  })
})
