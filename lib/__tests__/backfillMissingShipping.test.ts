import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  isShippingBackfillCandidate,
  shippingBackfillAmount,
  shippingBackfillLineDescription,
  shippingBackfillMarker,
  invoiceMentionsShippingBackfill,
} from '../ops/backfill-missing-shipping.ts'

describe('shippingBackfillMarker / description', () => {
  test('builds idempotent marker and line copy', () => {
    assert.equal(shippingBackfillMarker(266), 'shipping — Order #266')
    assert.equal(
      shippingBackfillLineDescription(266, 'TWO_DAY', '#1283'),
      '2-day shipping — Order #266 / Shopify #1283'
    )
    assert.equal(
      shippingBackfillLineDescription(267, 'OVERNIGHT', null),
      'Next-day shipping — Order #267'
    )
  })

  test('detects prior invoice text', () => {
    assert.equal(
      invoiceMentionsShippingBackfill(['2-day shipping — Order #266 / Shopify #1283'], 266),
      true
    )
    assert.equal(invoiceMentionsShippingBackfill(['Order #266 products'], 266), false)
  })
})

describe('isShippingBackfillCandidate', () => {
  const base = {
    orderNumber: 266,
    subtotal: 65,
    shippingTotal: 0,
    paymentStatus: 'CAPTURED',
    status: 'SUBMITTED',
    shipSpeed: 'TWO_DAY',
  }

  test('accepts under-$500 captured orders with $0 shipping', () => {
    assert.equal(isShippingBackfillCandidate(base), true)
    assert.equal(isShippingBackfillCandidate({ ...base, subtotal: 499.99 }), true)
  })

  test('rejects free-shipping tier, already-shipped fees, unpaid, cancelled', () => {
    assert.equal(isShippingBackfillCandidate({ ...base, subtotal: 500 }), false)
    assert.equal(isShippingBackfillCandidate({ ...base, shippingTotal: 15 }), false)
    assert.equal(isShippingBackfillCandidate({ ...base, paymentStatus: 'PENDING' }), false)
    assert.equal(isShippingBackfillCandidate({ ...base, status: 'CANCELLED' }), false)
    assert.equal(isShippingBackfillCandidate({ ...base, subtotal: 0 }), false)
  })
})

describe('shippingBackfillAmount', () => {
  test('uses restored global matrix without overrides', () => {
    assert.equal(shippingBackfillAmount(65, 'TWO_DAY'), 15)
    assert.equal(shippingBackfillAmount(400, null), 15)
    assert.equal(shippingBackfillAmount(100, 'OVERNIGHT'), 25)
    assert.equal(shippingBackfillAmount(600, 'TWO_DAY'), 0)
  })
})
