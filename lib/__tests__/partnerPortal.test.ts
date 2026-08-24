import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isPartnerMobileActive,
  isPartnerPrimaryActive,
  PARTNER_ACCOUNT_LINKS,
  PARTNER_EARNINGS_LINKS,
  PARTNER_GROW_LINKS,
  PARTNER_MOBILE_NAV,
  PARTNER_PRIMARY_NAV,
  partnerCanMutate,
  partnerPageTitle,
  partnerSectionForPath,
  visibleAccountLinks,
} from '../partners/portal'

describe('partner portal IA', () => {
  it('keeps desktop nav to four destinations', () => {
    assert.equal(PARTNER_PRIMARY_NAV.length, 4)
    assert.deepEqual(
      PARTNER_PRIMARY_NAV.map((i) => i.name),
      ['Home', 'Grow', 'Earnings', 'Account']
    )
  })

  it('puts Links on the phone bar instead of a Grow dump', () => {
    assert.equal(PARTNER_MOBILE_NAV.length, 4)
    assert.deepEqual(
      PARTNER_MOBILE_NAV.map((i) => i.name),
      ['Home', 'Links', 'Earnings', 'Account']
    )
  })

  it('leads Grow with referral links and calls leads Prospects', () => {
    assert.equal(PARTNER_GROW_LINKS[0].href, '/partners/links')
    assert.ok(PARTNER_GROW_LINKS.some((i) => i.name === 'Prospects' && i.href === '/partners/leads'))
    assert.ok(!PARTNER_GROW_LINKS.some((i) => i.name === 'Leads'))
  })

  it('keeps earnings to activity, statements, and payouts', () => {
    assert.deepEqual(
      PARTNER_EARNINGS_LINKS.map((i) => i.name),
      ['Activity', 'Statements', 'Payouts']
    )
  })

  it('separates sellers from portal logins on Account', () => {
    assert.equal(PARTNER_ACCOUNT_LINKS[0].name, 'Sellers')
    assert.equal(PARTNER_ACCOUNT_LINKS[0].href, '/partners/reps')
    assert.equal(PARTNER_ACCOUNT_LINKS[1].name, 'Portal access')
    assert.equal(PARTNER_ACCOUNT_LINKS[1].href, '/partners/team')
  })

  it('hides sellers, portal access, and margin pricing for reps', () => {
    const links = visibleAccountLinks({ kind: 'REP', role: null, marginModel: false })
    assert.ok(!links.some((i) => i.href === '/partners/reps'))
    assert.ok(!links.some((i) => i.href === '/partners/team'))
    assert.ok(!links.some((i) => i.href === '/partners/pricing'))
    assert.ok(links.some((i) => i.href === '/partners/terms'))
  })

  it('hides portal access from org viewers and pricing unless margin', () => {
    const viewer = visibleAccountLinks({ kind: 'ORG', role: 'VIEWER', marginModel: false })
    assert.ok(viewer.some((i) => i.href === '/partners/reps'))
    assert.ok(!viewer.some((i) => i.href === '/partners/team'))
    assert.ok(!viewer.some((i) => i.href === '/partners/pricing'))

    const ownerMargin = visibleAccountLinks({ kind: 'ORG', role: 'OWNER', marginModel: true })
    assert.ok(ownerMargin.some((i) => i.href === '/partners/team'))
    assert.ok(ownerMargin.some((i) => i.href === '/partners/pricing'))
  })
})

describe('partnerCanMutate', () => {
  it('blocks org viewers and allows admins, owners, and reps', () => {
    assert.equal(partnerCanMutate('ORG', 'VIEWER'), false)
    assert.equal(partnerCanMutate('ORG', 'ADMIN'), true)
    assert.equal(partnerCanMutate('ORG', 'OWNER'), true)
    assert.equal(partnerCanMutate('REP', null), true)
  })
})

describe('partner path helpers', () => {
  it('maps nested routes onto Grow, Earnings, and Account', () => {
    assert.equal(partnerSectionForPath('/partners/links'), 'grow')
    assert.equal(partnerSectionForPath('/partners/clinics/abc'), 'grow')
    assert.equal(partnerSectionForPath('/partners/payouts'), 'earnings')
    assert.equal(partnerSectionForPath('/partners/reps'), 'account')
    assert.equal(partnerSectionForPath('/partners'), null)
  })

  it('keeps Home exact and marks nested Grow/Earnings/Account as active', () => {
    assert.equal(isPartnerPrimaryActive('/partners', '/partners', true), true)
    assert.equal(isPartnerPrimaryActive('/partners', '/partners/links', true), false)
    assert.equal(isPartnerPrimaryActive('/partners/grow', '/partners/quotes'), true)
    assert.equal(isPartnerPrimaryActive('/partners/earnings', '/partners/statements'), true)
    assert.equal(isPartnerMobileActive('/partners/links', '/partners/links'), true)
    assert.equal(isPartnerMobileActive('/partners/links', '/partners/leads'), false)
  })

  it('uses partner-facing page titles', () => {
    assert.equal(partnerPageTitle('/partners/leads'), 'Prospects')
    assert.equal(partnerPageTitle('/partners/reps'), 'Sellers')
    assert.equal(partnerPageTitle('/partners/transactions'), 'Activity')
    assert.equal(partnerPageTitle('/partners/team'), 'Portal access')
  })
})
