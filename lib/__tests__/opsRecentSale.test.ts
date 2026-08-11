import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isOpsRecentSale } from '../sales'

describe('isOpsRecentSale', () => {
  it('keeps sales with no linked order status (CSV / legacy)', () => {
    assert.equal(isOpsRecentSale({}), true)
    assert.equal(isOpsRecentSale({ OrderStatus: null }), true)
    assert.equal(isOpsRecentSale({ OrderStatus: undefined }), true)
  })

  it('keeps open fulfillment statuses', () => {
    for (const status of ['SUBMITTED', 'APPROVED', 'FULFILLED', 'SHIPPED', 'COMPLETED']) {
      assert.equal(isOpsRecentSale({ OrderStatus: status }), true, status)
    }
  })

  it('excludes cancelled, rejected, and draft', () => {
    for (const status of ['CANCELLED', 'REJECTED', 'DRAFT']) {
      assert.equal(isOpsRecentSale({ OrderStatus: status }), false, status)
    }
  })
})
