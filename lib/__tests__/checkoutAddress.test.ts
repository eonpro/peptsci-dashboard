import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkoutShippingAddressSchema,
  buildPracticeCheckoutAddress,
  practiceOrderShippingAddress,
} from '../address.ts'

describe('checkoutShippingAddressSchema', () => {
  const street = {
    address1: '1213 N Franklin St',
    city: 'Tampa',
    state: 'FL',
    zip: '33602',
    country: 'US',
  }

  test('accepts a practice address with no email (undefined)', () => {
    const parsed = checkoutShippingAddressSchema.safeParse(street)
    assert.equal(parsed.success, true)
  })

  test('accepts empty or whitespace-only email (checkout always sends the field)', () => {
    for (const email of ['', '   ']) {
      const parsed = checkoutShippingAddressSchema.safeParse({ ...street, email })
      assert.equal(parsed.success, true, `expected email ${JSON.stringify(email)} to pass`)
      if (parsed.success) assert.equal(parsed.data.email, undefined)
    }
  })

  test('accepts a valid email and trims it', () => {
    const parsed = checkoutShippingAddressSchema.parse({
      ...street,
      email: '  incaretampa@incarenow.com ',
    })
    assert.equal(parsed.email, 'incaretampa@incarenow.com')
  })

  test('rejects a non-empty invalid email', () => {
    const parsed = checkoutShippingAddressSchema.safeParse({
      ...street,
      email: 'not-an-email',
    })
    assert.equal(parsed.success, false)
  })
})

describe('buildPracticeCheckoutAddress', () => {
  test('does not let a stored empty email overwrite the contact email', () => {
    const payload = buildPracticeCheckoutAddress({
      company: 'InCare Now',
      email: 'incaretampa@incarenow.com',
      phone: '8135550100',
      address: {
        address1: '1213 N Franklin St',
        city: 'Tampa',
        state: 'FL',
        zip: '33602',
        country: 'US',
        email: '',
        phone: '',
      },
    })
    assert.equal(payload.email, 'incaretampa@incarenow.com')
    assert.equal(payload.phone, '8135550100')
    assert.equal(payload.company, 'InCare Now')
    assert.equal(payload.address1, '1213 N Franklin St')
  })

  test('omits empty contact email so checkout validation does not fail', () => {
    const payload = buildPracticeCheckoutAddress({
      company: 'InCare Now',
      email: '',
      phone: '8135550100',
      address: {
        address1: '1213 N Franklin St',
        city: 'Tampa',
        state: 'FL',
        zip: '33602',
      },
    })
    assert.equal('email' in payload, false)
    const parsed = checkoutShippingAddressSchema.safeParse(payload)
    assert.equal(parsed.success, true)
  })
})

describe('practiceOrderShippingAddress', () => {
  test('stamps the practice shipping address for FedEx when the order itself has none', () => {
    const addr = practiceOrderShippingAddress({
      organizationName: 'InCare Now',
      contactName: 'Carressa Ball',
      contactEmail: 'incaretampa@incarenow.com',
      contactPhone: '8135550100',
      shippingAddress: {
        address1: '1213 N Franklin St',
        city: 'Tampa',
        state: 'FL',
        zip: '33602',
        country: 'US',
      },
      billingAddress: null,
    })
    assert.ok(addr)
    assert.equal(addr.address1, '1213 N Franklin St')
    assert.equal(addr.company, 'InCare Now')
    assert.equal(addr.personName, 'Carressa Ball')
    assert.equal(addr.phone, '8135550100')
    assert.equal(addr.email, 'incaretampa@incarenow.com')
  })

  test('falls back to billing address when shipping is missing', () => {
    const addr = practiceOrderShippingAddress({
      organizationName: 'InCare Now',
      contactName: null,
      contactEmail: null,
      contactPhone: null,
      shippingAddress: null,
      billingAddress: { address1: '1 Billing Rd', city: 'Tampa', state: 'FL', zip: '33602' },
    })
    assert.ok(addr)
    assert.equal(addr.address1, '1 Billing Rd')
    assert.equal(addr.personName, 'InCare Now')
  })

  test('returns null when the client has no saved address', () => {
    assert.equal(
      practiceOrderShippingAddress({
        organizationName: 'InCare Now',
        contactName: 'Carressa',
        contactEmail: null,
        contactPhone: null,
        shippingAddress: null,
        billingAddress: null,
      }),
      null
    )
  })
})
