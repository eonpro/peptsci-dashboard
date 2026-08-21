import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  ALL_PERMISSIONS,
  hasAllPermissions,
  hasAnyPermission,
  resolvePermissions,
  sanitizePermissions,
  staffHomeForPermissions,
} from '../permissions.ts'
import {
  permissionForAdminApi,
  permissionForAdminPage,
  satisfiesRoutePermission,
} from '../admin-route-permissions.ts'

describe('resolvePermissions', () => {
  test('SUPER_ADMIN gets all permissions and ignores deny', () => {
    const perms = resolvePermissions({
      role: 'SUPER_ADMIN',
      permissionsDeny: ['dashboard:read', 'system:migrate'],
    })
    assert.equal(perms.length, ALL_PERMISSIONS.length)
    assert.ok(perms.includes('system:migrate'))
    assert.ok(perms.includes('users:roles'))
  })

  test('ADMIN lacks users:roles and system:migrate by default', () => {
    const perms = resolvePermissions({ role: 'ADMIN' })
    assert.equal(perms.includes('users:roles'), false)
    assert.equal(perms.includes('system:migrate'), false)
    assert.ok(perms.includes('fulfillment:write'))
    assert.ok(perms.includes('billing:write'))
  })

  test('FULFILLMENT preset defaults', () => {
    const perms = resolvePermissions({ role: 'FULFILLMENT' })
    assert.ok(perms.includes('fulfillment:write'))
    assert.ok(perms.includes('catalog:read'))
    assert.ok(perms.includes('clients:read'))
    assert.equal(perms.includes('billing:write'), false)
    assert.equal(perms.includes('users:read'), false)
  })

  test('BILLING preset defaults', () => {
    const perms = resolvePermissions({ role: 'BILLING' })
    assert.ok(perms.includes('billing:write'))
    assert.ok(perms.includes('finance:read'))
    assert.ok(perms.includes('sales:read'))
    assert.equal(perms.includes('catalog:write'), false)
  })

  test('CATALOG preset defaults', () => {
    const perms = resolvePermissions({ role: 'CATALOG' })
    assert.ok(perms.includes('catalog:write'))
    assert.equal(perms.includes('fulfillment:write'), false)
  })

  test('FINANCE_VIEWER is read-only for finance/sales/billing', () => {
    const perms = resolvePermissions({ role: 'FINANCE_VIEWER' })
    assert.ok(perms.includes('finance:read'))
    assert.ok(perms.includes('sales:read'))
    assert.ok(perms.includes('billing:read'))
    assert.equal(perms.includes('billing:write'), false)
    assert.equal(perms.includes('sales:write'), false)
  })

  test('grant adds permissions; deny removes them', () => {
    const perms = resolvePermissions({
      role: 'FULFILLMENT',
      permissionsGrant: ['billing:read', 'not-a-real-permission'],
      permissionsDeny: ['catalog:read'],
    })
    assert.ok(perms.includes('billing:read'))
    assert.equal(perms.includes('catalog:read'), false)
    assert.equal(perms.includes('not-a-real-permission' as never), false)
  })

  test('CLIENT and PARTNER get empty permissions', () => {
    assert.deepEqual(resolvePermissions({ role: 'CLIENT' }), [])
    assert.deepEqual(resolvePermissions({ role: 'PARTNER' }), [])
  })
})

describe('permission helpers', () => {
  test('sanitizePermissions drops unknowns and dedupes', () => {
    assert.deepEqual(sanitizePermissions(['dashboard:read', 'nope', 'dashboard:read']), [
      'dashboard:read',
    ])
  })

  test('hasAllPermissions / hasAnyPermission', () => {
    const perms = resolvePermissions({ role: 'BILLING' })
    assert.equal(hasAllPermissions(perms, ['billing:read', 'finance:read']), true)
    assert.equal(hasAllPermissions(perms, ['billing:read', 'catalog:write']), false)
    assert.equal(hasAnyPermission(perms, ['catalog:write', 'finance:read']), true)
  })

  test('staffHomeForPermissions prefers specialty surfaces; admins get dashboard', () => {
    assert.equal(
      staffHomeForPermissions(resolvePermissions({ role: 'FULFILLMENT' }), 'FULFILLMENT'),
      '/fulfillment'
    )
    assert.equal(
      staffHomeForPermissions(resolvePermissions({ role: 'FINANCE_VIEWER' }), 'FINANCE_VIEWER'),
      '/profit-loss'
    )
    assert.equal(
      staffHomeForPermissions(resolvePermissions({ role: 'BILLING' }), 'BILLING'),
      '/invoices'
    )
    assert.equal(
      staffHomeForPermissions(resolvePermissions({ role: 'CATALOG' }), 'CATALOG'),
      '/products'
    )
    assert.equal(
      staffHomeForPermissions(resolvePermissions({ role: 'ADMIN' }), 'ADMIN'),
      '/dashboard'
    )
  })
})

describe('admin route permission map', () => {
  test('pages map to expected permissions', () => {
    assert.deepEqual(permissionForAdminPage('/fulfillment'), {
      anyOf: ['fulfillment:read'],
    })
    assert.deepEqual(permissionForAdminPage('/invoices'), { anyOf: ['billing:read'] })
    assert.deepEqual(permissionForAdminPage('/pricing/client-pricing'), {
      anyOf: ['catalog:read'],
    })
    assert.deepEqual(permissionForAdminPage('/users'), { anyOf: ['users:read'] })
  })

  test('APIs map to expected permissions', () => {
    assert.deepEqual(permissionForAdminApi('/api/admin/db/migrate'), {
      allOf: ['system:migrate'],
    })
    assert.deepEqual(permissionForAdminApi('/api/admin/fulfillment/stripe-queue'), {
      anyOf: ['fulfillment:read', 'fulfillment:write'],
    })
    assert.deepEqual(permissionForAdminApi('/api/inventory'), {
      anyOf: ['catalog:read', 'catalog:write'],
    })
    assert.deepEqual(permissionForAdminApi('/api/admin/notifications'), { staff: true })
  })

  test('satisfiesRoutePermission respects anyOf/allOf/staff', () => {
    const fulfillment = resolvePermissions({ role: 'FULFILLMENT' })
    assert.equal(
      satisfiesRoutePermission(fulfillment, { anyOf: ['fulfillment:read'] }, true),
      true
    )
    assert.equal(
      satisfiesRoutePermission(fulfillment, { anyOf: ['billing:write'] }, true),
      false
    )
    assert.equal(
      satisfiesRoutePermission(fulfillment, { allOf: ['system:migrate'] }, true),
      false
    )
    assert.equal(satisfiesRoutePermission(fulfillment, { staff: true }, true), true)
    assert.equal(satisfiesRoutePermission([], { staff: true }, false), false)
  })
})
