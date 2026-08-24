import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isStaffMobileActive,
  isStaffPrimaryActive,
  STAFF_ADMIN_LINKS,
  STAFF_CATALOG_LINKS,
  STAFF_MOBILE_NAV,
  STAFF_MONEY_LINKS,
  STAFF_PRIMARY_NAV,
  staffCanMutate,
  staffPageTitle,
  staffSectionForPath,
} from '../staff/portal.ts'
import { resolvePermissions } from '../permissions.ts'

describe('staff portal IA', () => {
  it('keeps desktop nav to five destinations', () => {
    assert.equal(STAFF_PRIMARY_NAV.length, 5)
    assert.deepEqual(
      STAFF_PRIMARY_NAV.map((i) => i.name),
      ['Home', 'Fulfill', 'Catalog', 'Money', 'Admin']
    )
    assert.equal(STAFF_PRIMARY_NAV.find((i) => i.name === 'Catalog')?.href, '/merch')
    assert.equal(STAFF_PRIMARY_NAV.find((i) => i.name === 'Admin')?.href, '/manage')
  })

  it('puts Fulfillment on the phone bar instead of Money', () => {
    assert.equal(STAFF_MOBILE_NAV.length, 4)
    assert.deepEqual(
      STAFF_MOBILE_NAV.map((i) => i.name),
      ['Home', 'Fulfillment', 'Catalog', 'Admin']
    )
  })

  it('calls practices Clinics and clinic list prices Clinic pricing', () => {
    assert.ok(STAFF_ADMIN_LINKS.some((i) => i.name === 'Clinics' && i.href === '/clients'))
    assert.ok(!STAFF_ADMIN_LINKS.some((i) => i.name === 'Clients'))
    assert.ok(STAFF_CATALOG_LINKS.some((i) => i.name === 'Clinic pricing'))
    assert.ok(!STAFF_CATALOG_LINKS.some((i) => i.name === 'Client Pricing'))
    assert.equal(STAFF_ADMIN_LINKS.find((i) => i.href === '/users')?.name, 'Users')
    assert.equal(STAFF_ADMIN_LINKS.find((i) => i.href === '/partners-admin')?.name, 'Partners')
  })

  it('groups catalog, money, and admin tools onto hub landings', () => {
    assert.equal(STAFF_CATALOG_LINKS[0].href, '/products')
    assert.ok(STAFF_MONEY_LINKS.some((i) => i.href === '/invoices'))
    assert.ok(STAFF_MONEY_LINKS.some((i) => i.href === '/profit-loss'))
    assert.ok(STAFF_ADMIN_LINKS.some((i) => i.href === '/users'))
  })
})

describe('staffCanMutate', () => {
  it('blocks finance viewers from writes and allows billing/catalog/admin', () => {
    const viewer = resolvePermissions({ role: 'FINANCE_VIEWER' })
    const billing = resolvePermissions({ role: 'BILLING' })
    const catalog = resolvePermissions({ role: 'CATALOG' })
    const admin = resolvePermissions({ role: 'ADMIN' })
    assert.equal(staffCanMutate(viewer), false)
    assert.equal(staffCanMutate(viewer, 'billing'), false)
    assert.equal(staffCanMutate(billing, 'billing'), true)
    assert.equal(staffCanMutate(catalog, 'catalog'), true)
    assert.equal(staffCanMutate(catalog, 'billing'), false)
    assert.equal(staffCanMutate(admin, 'users'), true)
  })
})

describe('staff path helpers', () => {
  it('maps nested routes onto Catalog, Money, and Admin', () => {
    assert.equal(staffSectionForPath('/products'), 'catalog')
    assert.equal(staffSectionForPath('/pricing/client-pricing'), 'catalog')
    assert.equal(staffSectionForPath('/invoices'), 'money')
    assert.equal(staffSectionForPath('/clients'), 'admin')
    assert.equal(staffSectionForPath('/dashboard'), null)
    assert.equal(staffSectionForPath('/fulfillment'), null)
  })

  it('keeps Home exact and marks nested Catalog/Money/Admin as active', () => {
    assert.equal(isStaffPrimaryActive('/dashboard', '/dashboard', true), true)
    assert.equal(isStaffPrimaryActive('/dashboard', '/products', true), false)
    assert.equal(isStaffPrimaryActive('/merch', '/inventory'), true)
    assert.equal(isStaffPrimaryActive('/money', '/invoices'), true)
    assert.equal(isStaffPrimaryActive('/manage', '/users'), true)
    assert.equal(isStaffMobileActive('/fulfillment', '/fulfillment'), true)
    assert.equal(isStaffMobileActive('/merch', '/products'), true)
  })

  it('uses staff-facing page titles', () => {
    assert.equal(staffPageTitle('/clients'), 'Clinics')
    assert.equal(staffPageTitle('/pricing/client-pricing'), 'Clinic pricing')
    assert.equal(staffPageTitle('/users'), 'Users')
    assert.equal(staffPageTitle('/merch'), 'Catalog')
  })
})
