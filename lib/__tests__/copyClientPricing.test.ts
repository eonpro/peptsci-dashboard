import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  planCopyClientPricing,
  type CopyPriceRow,
} from '../copy-client-pricing.ts'

function row(
  variantId: string,
  customPrice: number,
  extra?: Partial<CopyPriceRow>
): CopyPriceRow {
  return {
    variantId,
    customPrice,
    discountPercent: extra?.discountPercent ?? null,
    notes: extra?.notes ?? null,
    isActive: extra?.isActive ?? true,
  }
}

describe('planCopyClientPricing', () => {
  test('copies active source prices as upserts', () => {
    const plan = planCopyClientPricing(
      [row('v1', 40, { notes: 'partner', discountPercent: 20 }), row('v2', 55)],
      []
    )
    assert.equal(plan.upserts.length, 2)
    assert.deepEqual(plan.upserts[0], {
      variantId: 'v1',
      customPrice: 40,
      discountPercent: 20,
      notes: 'partner',
    })
    assert.deepEqual(plan.deactivate, [])
  })

  test('replace deactivates target-only SKUs so the models match', () => {
    const plan = planCopyClientPricing(
      [row('v1', 40)],
      [row('v1', 99), row('v2', 50), row('v3', 60)]
    )
    assert.deepEqual(
      plan.upserts.map((u) => u.variantId),
      ['v1']
    )
    assert.deepEqual(plan.deactivate.sort(), ['v2', 'v3'])
  })

  test('merge leaves target-only SKUs in place', () => {
    const plan = planCopyClientPricing(
      [row('v1', 40)],
      [row('v1', 99), row('v2', 50)],
      { replace: false }
    )
    assert.equal(plan.upserts.length, 1)
    assert.deepEqual(plan.deactivate, [])
  })

  test('ignores inactive and non-positive source rows', () => {
    const plan = planCopyClientPricing(
      [
        row('v1', 40),
        row('v2', 50, { isActive: false }),
        row('v3', 0),
        row('v4', -5),
      ],
      []
    )
    assert.deepEqual(
      plan.upserts.map((u) => u.variantId),
      ['v1']
    )
  })

  test('empty source with replace clears the target model', () => {
    const plan = planCopyClientPricing([], [row('v1', 40), row('v2', 50)])
    assert.deepEqual(plan.upserts, [])
    assert.deepEqual(plan.deactivate.sort(), ['v1', 'v2'])
  })

  test('does not deactivate already-inactive target rows', () => {
    const plan = planCopyClientPricing(
      [row('v1', 40)],
      [row('v2', 50, { isActive: false })]
    )
    assert.deepEqual(plan.deactivate, [])
  })
})
