import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  enrichShippingAddressWithBuyer,
  personNameFromShipTo,
  splitPersonName,
} from '../patients/upsert-from-ship-to'

describe('upsert-from-ship-to helpers', () => {
  it('splits full names', () => {
    assert.deepEqual(splitPersonName('Jane Doe'), { firstName: 'Jane', lastName: 'Doe' })
    assert.deepEqual(splitPersonName('Jane'), { firstName: 'Jane', lastName: '—' })
    assert.deepEqual(splitPersonName('Mary Ann Smith'), {
      firstName: 'Mary',
      lastName: 'Ann Smith',
    })
  })

  it('reads name from Shopify-shaped address', () => {
    const r = personNameFromShipTo({
      first_name: 'Ada',
      last_name: 'Lovelace',
      city: 'Tampa',
    })
    assert.equal(r.displayName, 'Ada Lovelace')
    assert.equal(r.firstName, 'Ada')
    assert.equal(r.lastName, 'Lovelace')
  })

  it('enriches shipping address with buyer email', () => {
    const enriched = enrichShippingAddressWithBuyer(
      { name: 'Jane Doe', address1: '1 Main', city: 'Tampa', state: 'FL', zip: '33602' },
      'Jane@Example.com'
    )
    assert.equal(enriched?.email, 'jane@example.com')
    assert.equal(enriched?.name, 'Jane Doe')
  })
})
