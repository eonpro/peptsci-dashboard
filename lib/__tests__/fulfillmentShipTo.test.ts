import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  shipToPersonName,
  shipToDisplayName,
  formatShipToSummary,
} from '../fulfillment/ship-to.ts'

const street = {
  address1: '12 Main St',
  city: 'Denver',
  state: 'CO',
  zip: '80203',
}

const client = {
  organizationName: 'Element Labs',
  contactName: 'Carressa Ball',
}

/** What the shop checkout wrote for "ship to patient" before the name was stamped. */
const legacyPatientOrder = {
  shipTo: 'PATIENT',
  shippingAddress: { ...street, firstName: 'Jane', lastName: 'Doe', phone: '3035550100' },
  client,
}

describe('shipToPersonName', () => {
  test('names the patient on a legacy ship-to-patient order, not the clinic contact', () => {
    assert.equal(shipToPersonName(legacyPatientOrder), 'Jane Doe')
  })

  test('prefers the recipient the API already resolved', () => {
    assert.equal(
      shipToPersonName({ ...legacyPatientOrder, recipientName: 'Janet Doe-Smith' }),
      'Janet Doe-Smith'
    )
  })

  test('falls back to the linked patient when the snapshot names no one', () => {
    assert.equal(
      shipToPersonName({
        shipTo: 'PATIENT',
        shippingAddress: street,
        patient: { firstName: 'Jane', lastName: 'Doe' },
        client,
      }),
      'Jane Doe'
    )
  })

  test('practice orders without a person on the address ship to the clinic contact', () => {
    assert.equal(
      shipToPersonName({ shipTo: 'PRACTICE', shippingAddress: { ...street, company: 'Element Labs' }, client }),
      'Carressa Ball'
    )
    assert.equal(shipToPersonName({ shippingAddress: street, client }), 'Carressa Ball')
  })

  test('never addresses a patient shipment to the clinic contact', () => {
    assert.equal(shipToPersonName({ shipTo: 'PATIENT', shippingAddress: street, client }), '')
    assert.equal(
      shipToPersonName({ shipTo: 'PATIENT', shippingAddress: street, client }, { orgFallback: true }),
      ''
    )
  })

  test('optionally falls back to the organization for practice labels', () => {
    const noContact = { shippingAddress: street, client: { organizationName: 'InCare Now', contactName: null } }
    assert.equal(shipToPersonName(noContact), '')
    assert.equal(shipToPersonName(noContact, { orgFallback: true }), 'InCare Now')
  })
})

describe('shipToDisplayName', () => {
  test('shows the patient for ship-to-patient orders', () => {
    assert.equal(shipToDisplayName(legacyPatientOrder), 'Jane Doe')
  })

  test('shows the company for practice orders whose address has no person', () => {
    assert.equal(
      shipToDisplayName({ shipTo: 'PRACTICE', shippingAddress: { ...street, company: 'InCare Now' } }),
      'InCare Now'
    )
  })

  test('is empty when nothing on the order names a recipient', () => {
    assert.equal(shipToDisplayName({ shippingAddress: street }), '')
  })
})

describe('formatShipToSummary', () => {
  test('leads with the patient, then street, then city/state/zip', () => {
    assert.equal(formatShipToSummary(legacyPatientOrder), 'Jane Doe · 12 Main St · Denver, CO 80203')
  })

  test('keeps the clinic contact for practice orders', () => {
    assert.equal(
      formatShipToSummary({ shipTo: 'PRACTICE', shippingAddress: street, client }),
      'Carressa Ball · 12 Main St · Denver, CO 80203'
    )
  })

  test('joins address2 onto the street line', () => {
    assert.equal(
      formatShipToSummary({
        shipTo: 'PATIENT',
        shippingAddress: { ...street, address2: 'Apt 4', name: 'Jane Doe' },
      }),
      'Jane Doe · 12 Main St, Apt 4 · Denver, CO 80203'
    )
  })

  test('office pickup names the practice, not the patient', () => {
    assert.equal(
      formatShipToSummary({
        shipSpeed: 'PICKUP',
        shippingAddress: { company: 'InCare Now' },
        client,
      }),
      'Office pickup · InCare Now'
    )
    assert.equal(
      formatShipToSummary({ shipSpeed: 'PICKUP', shippingAddress: null, client: null }),
      'Office pickup · Practice'
    )
  })

  test('says so when there is no address', () => {
    assert.equal(
      formatShipToSummary({ shipTo: 'PATIENT', shippingAddress: null, client: null }),
      'No shipping address on file'
    )
  })
})
