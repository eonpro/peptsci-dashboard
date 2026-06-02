import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { toFedExAddress } from '../shipping/address.ts'
import { isValidServiceType, isValidPackagingType } from '../fedex-services.ts'

describe('toFedExAddress', () => {
  test('maps checkout-style address (address1/zip) to FedEx shape', () => {
    const { address, missing } = toFedExAddress({
      name: 'Jane Doe',
      phone: '8135551234',
      address1: '123 Main St',
      city: 'Tampa',
      state: 'fl',
      zip: '33615',
    })
    assert.equal(address.personName, 'Jane Doe')
    assert.equal(address.phoneNumber, '8135551234')
    assert.equal(address.address1, '123 Main St')
    assert.equal(address.state, 'FL') // uppercased
    assert.equal(address.zip, '33615')
    assert.equal(address.countryCode, 'US')
    assert.deepEqual(missing, [])
  })

  test('supports legacy aliases (line1/postalCode/stateOrProvinceCode)', () => {
    const { address } = toFedExAddress({
      firstName: 'John',
      lastName: 'Smith',
      line1: '7543 W Waters Ave',
      city: 'Tampa',
      stateOrProvinceCode: 'FL',
      postalCode: '33615',
    })
    assert.equal(address.personName, 'John Smith')
    assert.equal(address.address1, '7543 W Waters Ave')
    assert.equal(address.zip, '33615')
  })

  test('reports missing required fields and uses fallbacks', () => {
    const { address, missing } = toFedExAddress(
      { address1: '1 A St', city: 'Tampa', state: 'FL', zip: '33615' },
      { fallbackName: 'Acme Clinic', fallbackPhone: '8135550000' }
    )
    assert.equal(address.personName, 'Acme Clinic')
    assert.equal(address.phoneNumber, '8135550000')
    assert.deepEqual(missing, [])
  })

  test('flags an empty address as missing all core fields', () => {
    const { missing } = toFedExAddress(null)
    assert.deepEqual(missing, ['personName', 'phoneNumber', 'address1', 'city', 'state', 'zip'])
  })
})

describe('fedex service/packaging validators', () => {
  test('accepts known codes', () => {
    assert.ok(isValidServiceType('STANDARD_OVERNIGHT'))
    assert.ok(isValidServiceType('FEDEX_GROUND'))
    assert.ok(isValidPackagingType('YOUR_PACKAGING'))
    assert.ok(isValidPackagingType('FEDEX_PAK'))
  })
  test('rejects unknown codes', () => {
    assert.equal(isValidServiceType('TELEPORT'), false)
    assert.equal(isValidPackagingType('CARDBOARD'), false)
  })
})
