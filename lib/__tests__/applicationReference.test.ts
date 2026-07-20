import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { applicationReference } from '../application-reference'

describe('applicationReference', () => {
  const date = new Date('2026-07-19T14:00:00Z')

  it('formats partner and clinic references', () => {
    assert.equal(applicationReference('partner', 'cmrpbj9qb000004joksizm77b', date), 'PRT-20260719-M77B')
    assert.equal(applicationReference('clinic', 'cmrpc580h000204jo0i3qlp5a', date), 'CLN-20260719-LP5A')
  })

  it('pads short ids and strips non-alphanumerics', () => {
    assert.equal(applicationReference('clinic', 'a-1!', date), 'CLN-20260719-00A1')
  })

  it('uses the UTC date', () => {
    // 2026-01-01T03:00Z is still Dec 31 in UTC-5 — the reference must not drift.
    assert.equal(
      applicationReference('partner', 'abcd1234', new Date('2026-01-01T03:00:00Z')),
      'PRT-20260101-1234'
    )
  })

  it('matches the thank-you page display pattern', () => {
    const ref = applicationReference('partner', 'cmrpbj9qb000004joksizm77b', date)
    assert.ok(/^[A-Z]{2,4}-\d{8}-[A-Z0-9]{3,8}$/.test(ref))
  })
})
