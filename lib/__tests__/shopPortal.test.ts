import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { welcomeEmail } from '../email/templates'
import {
  ACCOUNT_REVIEW_SLA,
  completedOnboardingSteps,
  productsWithPublishedCoa,
  SHOP_ACCOUNT_LINKS,
  SHOP_FAQS,
  SHOP_FOOTER,
  SHOP_MOBILE_NAV,
  SHOP_PRIMARY_NAV,
  SUPPORT_EMAIL,
} from '../shop/portal'

describe('clinic portal IA', () => {
  it('keeps desktop nav to four destinations', () => {
    assert.equal(SHOP_PRIMARY_NAV.length, 4)
    assert.deepEqual(
      SHOP_PRIMARY_NAV.map((i) => i.name),
      ['Products', 'Orders', 'Invoices', 'Account']
    )
    assert.ok(!SHOP_PRIMARY_NAV.some((i) => /storefront|customer|refer|resource/i.test(i.name)))
  })

  it('puts invoices, support, and patients first on Account', () => {
    assert.deepEqual(
      SHOP_ACCOUNT_LINKS.slice(0, 3).map((i) => i.name),
      ['Invoices', 'Support', 'Patients']
    )
    assert.ok(SHOP_ACCOUNT_LINKS.some((i) => i.href === '/shop/patients'))
    assert.ok(SHOP_ACCOUNT_LINKS.some((i) => i.href === '/catalog'))
    assert.ok(SHOP_ACCOUNT_LINKS.some((i) => i.href === '/shop/coas'))
  })

  it('drops Learn from the mobile bar and keeps search/cart/orders/account', () => {
    assert.equal(SHOP_MOBILE_NAV.length, 5)
    assert.deepEqual(
      SHOP_MOBILE_NAV.map((i) => i.label),
      ['Shop', 'Search', 'Cart', 'Orders', 'Account']
    )
  })

  it('footer uses real support routes and no placeholder phone', () => {
    const hrefs = [
      ...SHOP_FOOTER.quick,
      ...SHOP_FOOTER.support,
      ...SHOP_FOOTER.legal,
    ].map((l) => l.href)
    assert.ok(hrefs.includes('/tracking'))
    assert.ok(hrefs.includes('/shipping'))
    assert.ok(hrefs.includes('/privacy'))
    assert.ok(hrefs.includes('/termsandconditions'))
    assert.ok(hrefs.includes('/shop/support'))
    assert.equal(SHOP_FOOTER.email, SUPPORT_EMAIL)
    assert.doesNotMatch(JSON.stringify(SHOP_FOOTER), /555-1234/)
    assert.ok(!hrefs.includes('#'))
  })
})

describe('completedOnboardingSteps', () => {
  it('counts NPI, practice, billing, and shipping independently', () => {
    assert.equal(
      completedOnboardingSteps({
        npi: '',
        org: '',
        contactName: '',
        email: '',
        phone: '',
        billingZip: '',
        shippingSame: false,
        shippingZip: '',
      }),
      0
    )
    assert.equal(
      completedOnboardingSteps({
        npi: '1234567890',
        org: 'West Clinic',
        contactName: 'Ada West',
        email: 'ada@clinic.com',
        phone: '5551234567',
        billingZip: '33602',
        shippingSame: true,
        shippingZip: '',
      }),
      4
    )
  })
})

describe('productsWithPublishedCoa', () => {
  it('emits PDP hrefs only for products flagged with a COA', () => {
    const rows = productsWithPublishedCoa([
      { name: 'BPC-157', sku: 'BPC10', hasCoa: true },
      { name: 'AOD-9604', sku: 'AOD5', hasCoa: false },
    ])
    assert.deepEqual(rows, [{ name: 'BPC-157', sku: 'BPC10', href: '/shop/product/BPC10' }])
  })
})

describe('account review SLA', () => {
  it('is 1–2 business days in portal copy, FAQs, and the welcome email', () => {
    assert.equal(ACCOUNT_REVIEW_SLA, '1–2 business days')
    assert.ok(SHOP_FAQS[0]?.answer.includes(ACCOUNT_REVIEW_SLA))
    const { html, text } = welcomeEmail({ firstName: 'Ada' })
    assert.match(html, /1&ndash;2 business days|1–2 business days/)
    assert.match(text, /1-2 business days|1–2 business days/)
  })
})
