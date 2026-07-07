import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { assessShipmentPaymentGate } from '../fulfillment/payment-gate'

describe('assessShipmentPaymentGate', () => {
  it('allows captured orders', () => {
    const res = assessShipmentPaymentGate({ paymentStatus: 'CAPTURED', invoiced: false })
    assert.equal(res.allowed, true)
    assert.equal(res.reason, 'captured')
  })

  it('allows invoiced (net-terms) orders regardless of payment status', () => {
    const res = assessShipmentPaymentGate({ paymentStatus: 'PENDING', invoiced: true })
    assert.equal(res.allowed, true)
    assert.equal(res.reason, 'invoiced')
  })

  it('allows explicit override for unpaid orders', () => {
    const res = assessShipmentPaymentGate({
      paymentStatus: 'PENDING',
      invoiced: false,
      override: true,
    })
    assert.equal(res.allowed, true)
    assert.equal(res.reason, 'override')
  })

  it('blocks unpaid, un-invoiced orders without override', () => {
    for (const paymentStatus of ['PENDING', 'AUTHORIZED', 'FAILED', 'REFUNDED']) {
      const res = assessShipmentPaymentGate({ paymentStatus, invoiced: false })
      assert.equal(res.allowed, false, `expected ${paymentStatus} to be blocked`)
      assert.equal(res.reason, 'unpaid')
    }
  })

  it('blocks when override is explicitly false', () => {
    const res = assessShipmentPaymentGate({
      paymentStatus: 'PENDING',
      invoiced: false,
      override: false,
    })
    assert.equal(res.allowed, false)
  })

  it('captured takes precedence over override in reported reason', () => {
    const res = assessShipmentPaymentGate({
      paymentStatus: 'CAPTURED',
      invoiced: true,
      override: true,
    })
    assert.equal(res.allowed, true)
    assert.equal(res.reason, 'captured')
  })
})
