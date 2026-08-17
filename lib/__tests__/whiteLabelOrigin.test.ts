import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  getPeptSciOrigin,
  isCompleteShipFromAddress,
  looksLikePeptSciOrigin,
  resolveWhiteLabelOrigin,
  fedexShipFromDisplayName,
} from '../shipping/whiteLabelOrigin.ts'

const clientAddr = {
  address1: '100 Brand Ave',
  address2: 'Suite 5',
  city: 'Miami',
  state: 'FL',
  zip: '33101',
}

describe('resolveWhiteLabelOrigin', () => {
  test('non-Shopify orders keep PeptSci origin', () => {
    const origin = resolveWhiteLabelOrigin({
      source: 'DIRECT',
      client: {
        organizationName: 'Elevated Vitality Peptides',
        contactPhone: '5551112222',
        shippingAddress: clientAddr,
      },
    })
    assert.equal(origin.personName, getPeptSciOrigin().personName)
    assert.equal(origin.address1, getPeptSciOrigin().address1)
  })

  test('Shopify + complete client shipping address uses practice brand', () => {
    const origin = resolveWhiteLabelOrigin({
      source: 'SHOPIFY',
      client: {
        organizationName: 'Elevated Vitality Peptides',
        contactPhone: '5551112222',
        shippingAddress: clientAddr,
      },
    })
    assert.equal(origin.personName, 'Elevated Vitality')
    assert.equal(origin.companyName, 'Elevated Vitality')
    assert.equal(origin.phoneNumber, '5551112222')
    assert.equal(origin.address1, '100 Brand Ave')
    assert.equal(origin.address2, 'Suite 5')
    assert.equal(origin.city, 'Miami')
    assert.equal(origin.state, 'FL')
    assert.equal(origin.zip, '33101')
  })

  test('Shopify with incomplete client address still uses practice brand name', () => {
    const origin = resolveWhiteLabelOrigin({
      source: 'SHOPIFY',
      client: {
        organizationName: 'Elevated Vitality Peptides',
        contactPhone: '5551112222',
        shippingAddress: { city: 'Miami' },
      },
    })
    assert.equal(origin.personName, 'Elevated Vitality')
    assert.equal(origin.companyName, 'Elevated Vitality')
    assert.equal(origin.phoneNumber, '5551112222')
    // Physical ship-from falls back to PeptSci warehouse when practice address is incomplete.
    assert.equal(origin.address1, getPeptSciOrigin().address1)
    assert.equal(origin.zip, getPeptSciOrigin().zip)
  })

  test('whiteLabelEnabled non-Shopify still uses practice brand name', () => {
    const origin = resolveWhiteLabelOrigin({
      source: 'MANUAL',
      client: {
        organizationName: 'Elevated Vitality',
        whiteLabelEnabled: true,
        shippingAddress: clientAddr,
      },
    })
    assert.equal(origin.personName, 'Elevated Vitality')
    assert.equal(origin.address1, '100 Brand Ave')
  })

  test('Shopify without client falls back to PeptSci', () => {
    const origin = resolveWhiteLabelOrigin({ source: 'SHOPIFY', client: null })
    assert.equal(origin.address1, getPeptSciOrigin().address1)
  })

  test('accepts address field aliases (line1 / postalCode)', () => {
    const origin = resolveWhiteLabelOrigin({
      source: 'SHOPIFY',
      client: {
        organizationName: 'LIVBETR',
        shippingAddress: {
          line1: '9 Oak St',
          city: 'Tampa',
          stateOrProvinceCode: 'fl',
          postalCode: '33602',
        },
      },
    })
    assert.equal(origin.personName, 'LIVBETR')
    assert.equal(origin.address1, '9 Oak St')
    assert.equal(origin.state, 'FL')
    assert.equal(origin.zip, '33602')
    assert.equal(origin.phoneNumber, getPeptSciOrigin().phoneNumber)
  })
})

describe('isCompleteShipFromAddress / looksLikePeptSciOrigin', () => {
  test('complete requires street city state zip', () => {
    assert.equal(isCompleteShipFromAddress(clientAddr), true)
    assert.equal(isCompleteShipFromAddress({ address1: 'x', city: 'y' }), false)
  })

  test('detects PeptSci default origin', () => {
    assert.equal(looksLikePeptSciOrigin(getPeptSciOrigin()), true)
    assert.equal(
      looksLikePeptSciOrigin({
        personName: 'Elevated Vitality Peptides',
        address1: '100 Brand Ave',
        zip: '33101',
      }),
      false
    )
  })

  test('strips trailing Peptides from FedEx ship-from names', () => {
    assert.equal(fedexShipFromDisplayName('Elevated Vitality Peptides'), 'Elevated Vitality')
    assert.equal(fedexShipFromDisplayName('LIVBETR'), 'LIVBETR')
    assert.equal(fedexShipFromDisplayName('Acme Peptides'), 'Acme')
  })
})
