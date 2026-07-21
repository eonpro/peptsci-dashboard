import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  cleanNpi,
  isValidNpi,
  isNpiBypass,
  NPI_BYPASS,
  normalizeNppesResult,
  normalizeNppesResponse,
} from '../npi.ts'

describe('cleanNpi', () => {
  test('strips non-digits', () => {
    assert.equal(cleanNpi('123-456 7893'), '1234567893')
    assert.equal(cleanNpi('  abc 99 '), '99')
  })
})

describe('isValidNpi (Luhn / 80840 prefix)', () => {
  test('accepts a valid NPI (check digit 3)', () => {
    assert.equal(isValidNpi('1234567893'), true)
  })

  test('accepts a valid NPI with formatting', () => {
    assert.equal(isValidNpi('1234-567 893'), true)
  })

  test('rejects a wrong check digit', () => {
    assert.equal(isValidNpi('1234567890'), false)
    assert.equal(isValidNpi('1234567894'), false)
  })

  test('rejects wrong length', () => {
    assert.equal(isValidNpi('123456789'), false) // 9 digits
    assert.equal(isValidNpi('12345678931'), false) // 11 digits
    assert.equal(isValidNpi(''), false)
  })

  test('rejects all-same-digit repdigits', () => {
    assert.equal(isValidNpi('0000000000'), false)
    assert.equal(isValidNpi('9999999999'), false)
  })
})

describe('isNpiBypass (non-provider all-zeros sentinel)', () => {
  test('accepts 9 or 10 zeros, with or without formatting', () => {
    assert.equal(isNpiBypass('000000000'), true)
    assert.equal(isNpiBypass('0000000000'), true)
    assert.equal(isNpiBypass('000-000-000'), true)
    assert.equal(isNpiBypass(NPI_BYPASS), true)
  })

  test('rejects real NPIs and other repdigits', () => {
    assert.equal(isNpiBypass('1234567893'), false)
    assert.equal(isNpiBypass('9999999999'), false)
    assert.equal(isNpiBypass('00000000'), false) // 8 zeros
    assert.equal(isNpiBypass(''), false)
  })

  test('bypass value is still not a valid NPI', () => {
    assert.equal(isValidNpi(NPI_BYPASS), false)
  })
})

describe('normalizeNppesResult', () => {
  test('normalizes an individual provider', () => {
    const result = normalizeNppesResult({
      number: 1234567893,
      enumeration_type: 'NPI-1',
      basic: { first_name: 'Jane', last_name: 'Doe', credential: 'MD' },
      addresses: [
        {
          address_purpose: 'MAILING',
          address_1: 'PO Box 1',
          city: 'Nowhere',
          state: 'NV',
          postal_code: '88000',
        },
        {
          address_purpose: 'LOCATION',
          address_1: '123 Clinic Way',
          address_2: 'Suite 4',
          city: 'Los Angeles',
          state: 'CA',
          postal_code: '900011234',
          telephone_number: '310-555-0100',
        },
      ],
      taxonomies: [{ desc: 'Family Medicine', primary: true }],
    })

    assert.equal(result.type, 'individual')
    assert.equal(result.providerName, 'Jane Doe, MD')
    assert.equal(result.npiNumber, '1234567893')
    assert.equal(result.primaryTaxonomy, 'Family Medicine')
    // Picks the LOCATION (practice) address, not the mailing one.
    assert.equal(result.practiceAddress?.address1, '123 Clinic Way')
    assert.equal(result.practiceAddress?.zip, '90001-1234')
    assert.equal(result.phone, '310-555-0100')
  })

  test('normalizes an organization provider', () => {
    const result = normalizeNppesResult({
      number: '1234567893',
      enumeration_type: 'NPI-2',
      basic: { organization_name: 'ABC Medical Group' },
      addresses: [],
    })
    assert.equal(result.type, 'organization')
    assert.equal(result.providerName, 'ABC Medical Group')
    assert.equal(result.practiceAddress, undefined)
  })
})

describe('normalizeNppesResponse', () => {
  test('maps the results array and drops malformed entries', () => {
    const out = normalizeNppesResponse({
      results: [
        { number: 1234567893, enumeration_type: 'NPI-1', basic: { first_name: 'A', last_name: 'B' } },
        { number: 12, enumeration_type: 'NPI-1', basic: {} }, // too short → dropped
      ],
    })
    assert.equal(out.length, 1)
    assert.equal(out[0].providerName, 'A B')
  })

  test('returns [] for non-object / missing results', () => {
    assert.deepEqual(normalizeNppesResponse(null), [])
    assert.deepEqual(normalizeNppesResponse({}), [])
  })
})
