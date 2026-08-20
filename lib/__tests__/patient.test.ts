import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  patientCreateSchema,
  orderShippingAddressFromPatient,
  manualPatientShipToError,
} from '../patient.ts'

describe('patientCreateSchema', () => {
  const valid = {
    firstName: 'Kyle',
    lastName: 'Houlahan',
    address: {
      address1: '123 Main St',
      city: 'Colorado Springs',
      state: 'CO',
      zip: '80903',
      country: 'US',
    },
  }

  test('accepts name + US address; optional contact can be empty', () => {
    const parsed = patientCreateSchema.parse({ ...valid, phone: '', email: '' })
    assert.equal(parsed.firstName, 'Kyle')
    assert.equal(parsed.address.zip, '80903')
  })

  test('rejects a missing last name', () => {
    const result = patientCreateSchema.safeParse({ ...valid, lastName: '  ' })
    assert.equal(result.success, false)
  })

  test('rejects an invalid ZIP', () => {
    const result = patientCreateSchema.safeParse({
      ...valid,
      address: { ...valid.address, zip: '8090' },
    })
    assert.equal(result.success, false)
  })
})

describe('orderShippingAddressFromPatient', () => {
  test('copies address and stamps recipient name for FedEx/fulfillment', () => {
    const addr = orderShippingAddressFromPatient({
      firstName: 'Ada',
      lastName: 'Lovelace',
      phone: '7195550100',
      email: 'ada@example.com',
      address: {
        address1: '1 Main St',
        address2: 'Ste 2',
        city: 'Colorado Springs',
        state: 'CO',
        zip: '80903',
        country: 'US',
      },
    })
    assert.equal(addr.name, 'Ada Lovelace')
    assert.equal(addr.personName, 'Ada Lovelace')
    assert.equal(addr.firstName, 'Ada')
    assert.equal(addr.lastName, 'Lovelace')
    assert.equal(addr.phone, '7195550100')
    assert.equal(addr.email, 'ada@example.com')
    assert.equal(addr.address1, '1 Main St')
    assert.equal(addr.city, 'Colorado Springs')
    assert.equal(addr.residential, true)
  })
})

describe('manualPatientShipToError', () => {
  test('practice ship-to does not require a patient', () => {
    assert.equal(manualPatientShipToError({ shipTo: 'PRACTICE' }), null)
  })

  test('patient ship-to requires an existing id or a new patient payload', () => {
    assert.equal(
      manualPatientShipToError({ shipTo: 'PATIENT' }),
      'Select or add a patient to ship to'
    )
    assert.equal(manualPatientShipToError({ shipTo: 'PATIENT', patientId: 'p1' }), null)
    assert.equal(
      manualPatientShipToError({
        shipTo: 'PATIENT',
        patient: { firstName: 'Ada' },
      }),
      null
    )
  })
})
