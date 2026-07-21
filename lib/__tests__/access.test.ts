import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  isAdminRole,
  isSuperAdminRole,
  isActiveStatus,
  defaultRouteForRole,
  resolveEffectiveUnitPrice,
} from '../access.ts'

describe('role helpers', () => {
  test('isAdminRole is true for ADMIN and SUPER_ADMIN only', () => {
    assert.equal(isAdminRole('ADMIN'), true)
    assert.equal(isAdminRole('SUPER_ADMIN'), true)
    assert.equal(isAdminRole('CLIENT'), false)
    assert.equal(isAdminRole(undefined), false)
    assert.equal(isAdminRole(null), false)
  })

  test('isSuperAdminRole is true only for SUPER_ADMIN', () => {
    assert.equal(isSuperAdminRole('SUPER_ADMIN'), true)
    assert.equal(isSuperAdminRole('ADMIN'), false)
    assert.equal(isSuperAdminRole('CLIENT'), false)
  })

  test('isActiveStatus only true for ACTIVE', () => {
    assert.equal(isActiveStatus('ACTIVE'), true)
    assert.equal(isActiveStatus('PENDING'), false)
    assert.equal(isActiveStatus('SUSPENDED'), false)
  })

  test('defaultRouteForRole routes admins to dashboard, others to shop', () => {
    assert.equal(defaultRouteForRole('ADMIN'), '/dashboard')
    assert.equal(defaultRouteForRole('SUPER_ADMIN'), '/dashboard')
    assert.equal(defaultRouteForRole('CLIENT'), '/shop')
    assert.equal(defaultRouteForRole(undefined), '/shop')
  })
})

describe('resolveEffectiveUnitPrice', () => {
  test('uses custom price when positive', () => {
    const r = resolveEffectiveUnitPrice({ srp: 349, customPrice: 299 })
    assert.equal(r.price, 299)
    assert.equal(r.isCustom, true)
  })

  test('falls back to SRP when custom price is null/undefined', () => {
    assert.deepEqual(resolveEffectiveUnitPrice({ srp: 349, customPrice: null }), {
      price: 349,
      isCustom: false,
      isAtCost: false,
    })
    assert.deepEqual(resolveEffectiveUnitPrice({ srp: 349 }), {
      price: 349,
      isCustom: false,
      isAtCost: false,
    })
  })

  test('ignores zero or negative custom prices', () => {
    assert.equal(resolveEffectiveUnitPrice({ srp: 349, customPrice: 0 }).isCustom, false)
    assert.equal(resolveEffectiveUnitPrice({ srp: 349, customPrice: -5 }).price, 349)
  })

  test('at-cost clinics pay unitCost, overriding custom price and SRP', () => {
    const r = resolveEffectiveUnitPrice({
      srp: 349,
      customPrice: 299,
      unitCost: 120,
      paysAtCost: true,
    })
    assert.deepEqual(r, { price: 120, isCustom: true, isAtCost: true })
  })

  test('at-cost falls through to custom/SRP when unitCost is missing or zero', () => {
    assert.deepEqual(
      resolveEffectiveUnitPrice({ srp: 349, customPrice: 299, unitCost: 0, paysAtCost: true }),
      { price: 299, isCustom: true, isAtCost: false }
    )
    assert.deepEqual(
      resolveEffectiveUnitPrice({ srp: 349, unitCost: null, paysAtCost: true }),
      { price: 349, isCustom: false, isAtCost: false }
    )
  })

  test('unitCost is ignored when the clinic is not flagged paysAtCost', () => {
    assert.deepEqual(resolveEffectiveUnitPrice({ srp: 349, unitCost: 120 }), {
      price: 349,
      isCustom: false,
      isAtCost: false,
    })
    assert.deepEqual(
      resolveEffectiveUnitPrice({ srp: 349, customPrice: 299, unitCost: 120, paysAtCost: false }),
      { price: 299, isCustom: true, isAtCost: false }
    )
  })
})
