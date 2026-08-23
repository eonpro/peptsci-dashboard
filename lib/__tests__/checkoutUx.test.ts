import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkoutCanPay,
  formatAddressOneLine,
  isPracticeAddressComplete,
  shouldExpandPracticeForm,
} from '../shop/checkout-ux'

const complete = {
  address1: '1213 N Franklin St',
  city: 'Tampa',
  state: 'FL',
  zip: '33602',
}

describe('isPracticeAddressComplete', () => {
  it('requires street, city, state, and a 5-digit ZIP', () => {
    assert.equal(isPracticeAddressComplete(complete), true)
    assert.equal(isPracticeAddressComplete({ ...complete, zip: '33602-1234' }), true)
    assert.equal(isPracticeAddressComplete({ ...complete, zip: '3360' }), false)
    assert.equal(isPracticeAddressComplete({ ...complete, address1: '' }), false)
  })
})

describe('checkoutCanPay', () => {
  it('lets a complete practice address pay without a second step', () => {
    assert.equal(
      checkoutCanPay({ shipTo: 'PRACTICE', practiceComplete: true, selectedPatientId: '' }),
      true
    )
    assert.equal(
      checkoutCanPay({ shipTo: 'PRACTICE', practiceComplete: false, selectedPatientId: '' }),
      false
    )
  })

  it('requires a selected patient when shipping to a patient', () => {
    assert.equal(
      checkoutCanPay({
        shipTo: 'PATIENT',
        practiceComplete: true,
        selectedPatientId: '',
      }),
      false
    )
    assert.equal(
      checkoutCanPay({
        shipTo: 'PATIENT',
        practiceComplete: false,
        selectedPatientId: 'pat_1',
      }),
      true
    )
  })
})

describe('formatAddressOneLine', () => {
  it('joins street, city/state, and ZIP', () => {
    assert.equal(formatAddressOneLine(complete), '1213 N Franklin St · Tampa, FL · 33602')
  })
})

describe('shouldExpandPracticeForm', () => {
  it('stays collapsed when the practice address is on file', () => {
    assert.equal(
      shouldExpandPracticeForm({
        prefillFailed: false,
        practiceComplete: true,
        editing: false,
      }),
      false
    )
  })

  it('expands when prefill failed, incomplete, or the user is editing', () => {
    assert.equal(
      shouldExpandPracticeForm({
        prefillFailed: true,
        practiceComplete: false,
        editing: false,
      }),
      true
    )
    assert.equal(
      shouldExpandPracticeForm({
        prefillFailed: false,
        practiceComplete: false,
        editing: false,
      }),
      true
    )
    assert.equal(
      shouldExpandPracticeForm({
        prefillFailed: false,
        practiceComplete: true,
        editing: true,
      }),
      true
    )
  })
})
