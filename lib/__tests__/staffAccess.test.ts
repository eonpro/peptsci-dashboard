import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SUPPORT_EMAIL } from '../shop/portal.ts'
import {
  isSafeStaffRedirect,
  isStaffSignInIntent,
  STAFF_HOME_PATH,
  STAFF_SIGN_IN_PATH,
  STAFF_WRONG_ACCOUNT_PATH,
  staffNeedsTwoFactor,
  staffNoAccessCopy,
  staffNoAccessKind,
  staffPostAuthPath,
} from '../staff/access.ts'
import { resolvePermissions } from '../permissions.ts'

describe('staff access paths', () => {
  it('keeps a dedicated staff sign-in URL', () => {
    assert.equal(STAFF_SIGN_IN_PATH, '/staff/sign-in')
    assert.equal(STAFF_HOME_PATH, '/dashboard')
    assert.equal(STAFF_WRONG_ACCOUNT_PATH, '/staff/wrong-account')
  })

  it('sends staff intent and admin redirects into the console after auth', () => {
    assert.equal(staffPostAuthPath({ intent: 'staff' }), '/dashboard')
    assert.equal(staffPostAuthPath({ redirectUrl: '/fulfillment' }), '/fulfillment')
    assert.equal(staffPostAuthPath({ redirectUrl: '/shop' }), '/dashboard')
    assert.equal(staffPostAuthPath({ redirectUrl: '//evil.example' }), '/dashboard')
    assert.equal(staffPostAuthPath({}), '/dashboard')
  })

  it('treats staff intent or an admin redirect as staff sign-in', () => {
    assert.equal(isStaffSignInIntent({ intent: 'staff' }), true)
    assert.equal(isStaffSignInIntent({ redirectUrl: '/dashboard' }), true)
    assert.equal(isStaffSignInIntent({ redirectUrl: '/partners' }), false)
    assert.equal(isStaffSignInIntent({}), false)
  })

  it('rejects open redirects that are not admin console paths', () => {
    assert.equal(isSafeStaffRedirect('/dashboard'), true)
    assert.equal(isSafeStaffRedirect('/merch'), true)
    assert.equal(isSafeStaffRedirect('/shop'), false)
    assert.equal(isSafeStaffRedirect('/partners'), false)
  })
})

describe('staffNoAccessKind', () => {
  it('separates clinic, partner, and unlinked staff logins', () => {
    assert.equal(staffNoAccessKind('CLIENT'), 'clinic')
    assert.equal(staffNoAccessKind('PARTNER'), 'partner')
    assert.equal(staffNoAccessKind('ADMIN'), 'unlinked')
    assert.equal(staffNoAccessKind(undefined), 'clinic')
  })
})

describe('staffNoAccessCopy', () => {
  it('tells a clinic login to sign out instead of ordering from admin', () => {
    const copy = staffNoAccessCopy('clinic')
    assert.match(copy.title, /clinic/i)
    assert.match(copy.body, /sign out/i)
    assert.equal(copy.primary.label, 'Sign out')
    assert.equal(copy.primary.href, STAFF_SIGN_IN_PATH)
    assert.equal(copy.secondary.href, '/shop')
  })

  it('tells a partner login to use the partner portal', () => {
    const copy = staffNoAccessCopy('partner')
    assert.match(copy.body, /partner/i)
    assert.equal(copy.secondary.href, '/partners')
    assert.ok(copy.body.includes(SUPPORT_EMAIL) || copy.secondary.href === '/partners')
  })
})

describe('staffNeedsTwoFactor', () => {
  it('requires 2FA for writers of money or PII, not finance viewers', () => {
    assert.equal(staffNeedsTwoFactor(resolvePermissions({ role: 'ADMIN' })), true)
    assert.equal(staffNeedsTwoFactor(resolvePermissions({ role: 'BILLING' })), true)
    assert.equal(staffNeedsTwoFactor(resolvePermissions({ role: 'FULFILLMENT' })), true)
    assert.equal(staffNeedsTwoFactor(resolvePermissions({ role: 'FINANCE_VIEWER' })), false)
  })
})
