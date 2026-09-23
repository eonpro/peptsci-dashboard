import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatOfficePickupAddress,
  getOfficePickupLocation,
} from '../shipping/pickup.ts'
import { getPeptSciOrigin } from '../shipping/whiteLabelOrigin.ts'

describe('office pickup location', () => {
  test('uses the PeptSci origin street so warehouse copy stays in one place', () => {
    const origin = getPeptSciOrigin()
    const loc = getOfficePickupLocation()
    assert.equal(loc.address1, origin.address1)
    assert.equal(loc.city, origin.city)
    assert.equal(loc.state, origin.state)
    assert.equal(loc.zip, origin.zip)
    assert.match(formatOfficePickupAddress(), new RegExp(origin.address1))
    assert.match(formatOfficePickupAddress(), new RegExp(origin.zip))
  })
})
