import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  joinPersonName,
  recipientNameFromAddress,
  recipientNameFromPatient,
  orderRecipientName,
  orderShipToLabel,
  patientShipToName,
  patientNameSearchWhere,
} from '../orders/recipient.ts'
import { orderShippingAddressFromPatient } from '../patient.ts'

/**
 * Order.shippingAddress is written in three shapes. The shop checkout used to
 * store only firstName/lastName for "ship to patient", and every admin surface
 * read only name/personName — so Element Labs' and InCare's patient orders
 * showed no patient on labels, the fulfillment queue, or invoices.
 */
const street = {
  address1: '12 Main St',
  city: 'Denver',
  state: 'CO',
  zip: '80203',
}

describe('joinPersonName', () => {
  test('joins first + last and collapses whitespace', () => {
    assert.equal(joinPersonName('  Jane ', '  Doe  '), 'Jane Doe')
    assert.equal(joinPersonName('Mary  Ann', 'Smith'), 'Mary Ann Smith')
  })

  test('drops the placeholder last name written for single-word names', () => {
    assert.equal(joinPersonName('Madonna', '—'), 'Madonna')
    assert.equal(joinPersonName('Cher', ' – '), 'Cher')
    assert.equal(joinPersonName('Prince', '-'), 'Prince')
  })

  test('tolerates missing or non-string parts', () => {
    assert.equal(joinPersonName('Jane', null), 'Jane')
    assert.equal(joinPersonName(undefined, 'Doe'), 'Doe')
    assert.equal(joinPersonName(42, {}), '')
    assert.equal(joinPersonName(null, null), '')
  })
})

describe('recipientNameFromAddress', () => {
  test('reads the legacy shop-checkout shape (firstName + lastName only)', () => {
    const legacy = { ...street, firstName: 'Jane', lastName: 'Doe', phone: '3035550100' }
    assert.equal(recipientNameFromAddress(legacy), 'Jane Doe')
  })

  test('reads name / personName written by admin New Order, Shopify and Stripe convert', () => {
    assert.equal(recipientNameFromAddress({ ...street, name: 'Ada Lovelace' }), 'Ada Lovelace')
    assert.equal(recipientNameFromAddress({ ...street, personName: 'Ada Lovelace' }), 'Ada Lovelace')
  })

  test('prefers the explicit FedEx personName, then name, then first + last', () => {
    assert.equal(
      recipientNameFromAddress({ personName: 'A', name: 'B', firstName: 'C', lastName: 'D' }),
      'A'
    )
    assert.equal(recipientNameFromAddress({ name: 'B', firstName: 'C', lastName: 'D' }), 'B')
    assert.equal(recipientNameFromAddress({ firstName: 'C', lastName: 'D' }), 'C D')
  })

  test('keeps the legacy contactName alias used by the packing slip', () => {
    assert.equal(recipientNameFromAddress({ ...street, contactName: 'Front Desk' }), 'Front Desk')
  })

  test('returns an empty string when there is no person on the address', () => {
    assert.equal(recipientNameFromAddress(null), '')
    assert.equal(recipientNameFromAddress(undefined), '')
    assert.equal(recipientNameFromAddress('Jane Doe'), '')
    assert.equal(recipientNameFromAddress(['Jane', 'Doe']), '')
    assert.equal(recipientNameFromAddress({}), '')
    assert.equal(recipientNameFromAddress({ ...street, name: '   ', firstName: '', lastName: ' ' }), '')
    // A company-only practice address has no person.
    assert.equal(recipientNameFromAddress({ ...street, company: 'InCare Now' }), '')
  })
})

describe('recipientNameFromPatient', () => {
  test('formats the linked patient row', () => {
    assert.equal(recipientNameFromPatient({ firstName: 'Kyle', lastName: 'Houlahan' }), 'Kyle Houlahan')
    assert.equal(recipientNameFromPatient({ firstName: 'Madonna', lastName: '—' }), 'Madonna')
    assert.equal(recipientNameFromPatient(null), '')
    assert.equal(recipientNameFromPatient(undefined), '')
  })
})

describe('orderRecipientName', () => {
  test('uses the address snapshot first so the name matches the street we print', () => {
    assert.equal(
      orderRecipientName({
        shippingAddress: { ...street, firstName: 'Jane', lastName: 'Doe' },
        patient: { firstName: 'Janet', lastName: 'Doe-Smith' },
      }),
      'Jane Doe'
    )
  })

  test('falls back to the linked patient when the snapshot has no person', () => {
    assert.equal(
      orderRecipientName({
        shippingAddress: { ...street },
        patient: { firstName: 'Jane', lastName: 'Doe' },
      }),
      'Jane Doe'
    )
    assert.equal(
      orderRecipientName({ shippingAddress: null, patient: { firstName: 'Jane', lastName: 'Doe' } }),
      'Jane Doe'
    )
  })

  test('is empty when neither the snapshot nor a patient names anyone', () => {
    assert.equal(orderRecipientName({ shippingAddress: street, patient: null }), '')
    assert.equal(orderRecipientName({}), '')
  })
})

describe('orderShipToLabel', () => {
  test('shows the person when there is one', () => {
    assert.equal(
      orderShipToLabel({ shippingAddress: { ...street, firstName: 'Jane', lastName: 'Doe', company: 'X' } }),
      'Jane Doe'
    )
  })

  test('falls back to the company for practice ship-to orders', () => {
    assert.equal(
      orderShipToLabel({ shippingAddress: { ...street, company: 'InCare Now' } }),
      'InCare Now'
    )
    assert.equal(
      orderShipToLabel({ shippingAddress: { ...street, companyName: 'InCare Now' } }),
      'InCare Now'
    )
  })

  test('is empty when the address names no one', () => {
    assert.equal(orderShipToLabel({ shippingAddress: street }), '')
  })
})

describe('patientShipToName', () => {
  test('names the patient on ship-to-patient orders', () => {
    assert.equal(
      patientShipToName({
        shipTo: 'PATIENT',
        shippingAddress: { ...street, firstName: 'Jane', lastName: 'Doe' },
      }),
      'Jane Doe'
    )
    assert.equal(
      patientShipToName({
        shipTo: 'PATIENT',
        shippingAddress: null,
        patient: { firstName: 'Jane', lastName: 'Doe' },
      }),
      'Jane Doe'
    )
  })

  test('is empty for practice orders even when the snapshot carries the clinic contact', () => {
    assert.equal(
      patientShipToName({
        shipTo: 'PRACTICE',
        shippingAddress: { ...street, name: 'Carressa Ball', personName: 'Carressa Ball' },
      }),
      ''
    )
    assert.equal(patientShipToName({ shippingAddress: { ...street, name: 'Carressa Ball' } }), '')
  })
})

describe('patientNameSearchWhere', () => {
  const word = (w: string) => ({
    OR: [
      { firstName: { contains: w, mode: 'insensitive' } },
      { lastName: { contains: w, mode: 'insensitive' } },
    ],
  })

  test('matches each typed word against the patient first or last name', () => {
    assert.deepEqual(patientNameSearchWhere('  jane   doe '), {
      patient: { AND: [word('jane'), word('doe')] },
    })
    assert.deepEqual(patientNameSearchWhere('Doe'), { patient: { AND: [word('Doe')] } })
  })

  test('returns null for a blank search', () => {
    assert.equal(patientNameSearchWhere(''), null)
    assert.equal(patientNameSearchWhere('   '), null)
    assert.equal(patientNameSearchWhere(undefined), null)
  })

  test('caps the number of words so a pasted paragraph cannot build a huge query', () => {
    const where = patientNameSearchWhere('a b c d e f g h i j k l')
    assert.equal(where?.patient.AND.length, 5)
  })
})

describe('writer/reader agreement', () => {
  const patient = {
    firstName: 'Jane',
    lastName: 'Doe',
    phone: '3035550100',
    email: 'jane@example.com',
    address: { ...street, country: 'US' },
  }

  test('the canonical patient snapshot resolves to the patient name', () => {
    const snapshot = orderShippingAddressFromPatient(patient)
    assert.equal(recipientNameFromAddress(snapshot), 'Jane Doe')
    assert.equal(snapshot.name, 'Jane Doe')
    assert.equal(snapshot.personName, 'Jane Doe')
  })

  test('the legacy shop-checkout snapshot resolves to the same name', () => {
    const legacy = {
      ...patient.address,
      firstName: patient.firstName,
      lastName: patient.lastName,
      phone: patient.phone,
    }
    assert.equal(recipientNameFromAddress(legacy), 'Jane Doe')
    assert.equal(
      recipientNameFromAddress(legacy),
      recipientNameFromAddress(orderShippingAddressFromPatient(patient))
    )
  })
})
