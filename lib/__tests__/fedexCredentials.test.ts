import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { resolveShipCredentials, resolveTrackCredentials } from '../shipping/fedex-credentials.ts'

const ship = {
  FEDEX_CLIENT_ID: 'ship-id',
  FEDEX_CLIENT_SECRET: 'ship-secret',
  FEDEX_ACCOUNT_NUMBER: '203947823',
}

const track = {
  FEDEX_TRACK_CLIENT_ID: 'track-id',
  FEDEX_TRACK_CLIENT_SECRET: 'track-secret',
}

describe('resolveShipCredentials', () => {
  test('requires ship id, secret, and account number', () => {
    assert.equal(resolveShipCredentials({}), null)
    assert.equal(resolveShipCredentials({ FEDEX_CLIENT_ID: 'x' }), null)
    assert.deepEqual(resolveShipCredentials(ship), {
      clientId: 'ship-id',
      clientSecret: 'ship-secret',
      accountNumber: '203947823',
    })
  })

  test('ignores track keys', () => {
    const creds = resolveShipCredentials({ ...ship, ...track })
    assert.equal(creds?.clientId, 'ship-id')
  })
})

describe('resolveTrackCredentials', () => {
  test('uses dedicated BIV keys when set', () => {
    assert.deepEqual(resolveTrackCredentials({ ...ship, ...track }), {
      clientId: 'track-id',
      clientSecret: 'track-secret',
      accountNumber: '203947823',
    })
  })

  test('does not fall back to ship keys (BIV cannot share a Ship project)', () => {
    assert.equal(resolveTrackCredentials(ship), null)
    assert.equal(resolveTrackCredentials({}), null)
  })

  test('prefers FEDEX_TRACK_ACCOUNT_NUMBER when set', () => {
    const creds = resolveTrackCredentials({
      ...track,
      FEDEX_ACCOUNT_NUMBER: '111',
      FEDEX_TRACK_ACCOUNT_NUMBER: '203947823',
    })
    assert.equal(creds?.accountNumber, '203947823')
  })
})
