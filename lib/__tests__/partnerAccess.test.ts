import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ACCOUNT_REVIEW_SLA, SUPPORT_EMAIL } from '../shop/portal'
import {
  isPartnerSignInIntent,
  PARTNER_APPLY_PATH,
  PARTNER_HOME_PATH,
  PARTNER_REVIEW_SLA,
  PARTNER_SIGN_IN_PATH,
  partnerNoAccessCopy,
  partnerNoAccessKind,
  partnerPendingCopy,
  partnerPostAuthPath,
} from '../partners/access'

describe('partner access paths', () => {
  it('keeps a dedicated partner sign-in and apply URL', () => {
    assert.equal(PARTNER_SIGN_IN_PATH, '/partners/sign-in')
    assert.equal(PARTNER_APPLY_PATH, '/partners/apply')
    assert.equal(PARTNER_HOME_PATH, '/partners')
  })

  it('sends partner intent and /partners redirects into the portal after auth', () => {
    assert.equal(partnerPostAuthPath({ intent: 'partner' }), '/partners')
    assert.equal(
      partnerPostAuthPath({ redirectUrl: '/partners/agreement' }),
      '/partners/agreement'
    )
    assert.equal(partnerPostAuthPath({ redirectUrl: '/shop' }), '/')
    assert.equal(partnerPostAuthPath({}), '/')
  })

  it('treats partner intent or a /partners redirect as partner sign-in', () => {
    assert.equal(isPartnerSignInIntent({ intent: 'partner' }), true)
    assert.equal(isPartnerSignInIntent({ redirectUrl: '/partners' }), true)
    assert.equal(isPartnerSignInIntent({ redirectUrl: '/shop' }), false)
    assert.equal(isPartnerSignInIntent({}), false)
  })
})

describe('partnerNoAccessKind', () => {
  it('separates clinic, staff, and unlinked partner logins', () => {
    assert.equal(partnerNoAccessKind('CLIENT'), 'clinic')
    assert.equal(partnerNoAccessKind('PARTNER'), 'unlinked')
    assert.equal(partnerNoAccessKind('ADMIN'), 'staff')
    assert.equal(partnerNoAccessKind(undefined), 'clinic')
  })
})

describe('partnerNoAccessCopy', () => {
  it('tells a clinic login to sign out instead of applying as a practice', () => {
    const copy = partnerNoAccessCopy('clinic')
    assert.match(copy.title, /clinic/i)
    assert.match(copy.body, /sign out/i)
    assert.equal(copy.primary.label, 'Sign out')
    assert.equal(copy.secondary?.href, PARTNER_APPLY_PATH)
  })

  it('tells an unlinked partner to use the invitation email', () => {
    const copy = partnerNoAccessCopy('unlinked')
    assert.match(copy.body, /invitation/i)
    assert.equal(copy.secondary?.href, PARTNER_APPLY_PATH)
  })
})

describe('partnerPendingCopy', () => {
  it('shares the clinic review SLA and does not promise product ordering', () => {
    assert.equal(PARTNER_REVIEW_SLA, ACCOUNT_REVIEW_SLA)
    const copy = partnerPendingCopy()
    assert.ok(copy.bullets.some((b) => b.includes(PARTNER_REVIEW_SLA)))
    assert.ok(!copy.bullets.some((b) => /place orders|NPI/i.test(b)))
    assert.ok(copy.expedite.includes('organization'))
    assert.equal(copy.supportEmail, SUPPORT_EMAIL)
  })
})
