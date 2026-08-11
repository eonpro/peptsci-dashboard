import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { pickRefundablePaymentIntentId } from '../orders/payment-intent'
import {
  assessOrderCancel,
  stripeReasonForCancel,
  ORDER_CANCEL_REASONS,
} from '../orders/cancel'
import { shouldCancelFulfillmentOnStripeRefund } from '../orders/apply-stripe-refund'

describe('pickRefundablePaymentIntentId', () => {
  it('prefers Order PI over invoice and SalesRecord', () => {
    const res = pickRefundablePaymentIntentId({
      orderPaymentIntentId: 'pi_order',
      invoicePaymentIntentIds: ['pi_invoice'],
      salesRecordPaymentIntentId: 'pi_sales',
    })
    assert.deepEqual(res, { paymentIntentId: 'pi_order', source: 'order' })
  })

  it('falls back to first invoice payment PI (white-label)', () => {
    const res = pickRefundablePaymentIntentId({
      orderPaymentIntentId: null,
      invoicePaymentIntentIds: [null, '  ', 'pi_inv_34'],
      salesRecordPaymentIntentId: 'pi_sales',
    })
    assert.deepEqual(res, { paymentIntentId: 'pi_inv_34', source: 'invoice' })
  })

  it('falls back to SalesRecord when invoice has no PI', () => {
    const res = pickRefundablePaymentIntentId({
      orderPaymentIntentId: undefined,
      invoicePaymentIntentIds: [],
      salesRecordPaymentIntentId: 'pi_sales',
    })
    assert.deepEqual(res, { paymentIntentId: 'pi_sales', source: 'sales_record' })
  })

  it('returns null when no PI exists', () => {
    const res = pickRefundablePaymentIntentId({
      orderPaymentIntentId: null,
      invoicePaymentIntentIds: [null],
      salesRecordPaymentIntentId: null,
    })
    assert.deepEqual(res, { paymentIntentId: null, source: null })
  })
})

describe('assessOrderCancel', () => {
  it('allows open unshipped orders', () => {
    assert.deepEqual(assessOrderCancel({ status: 'SUBMITTED', trackingNumber: null }), {
      allowed: true,
    })
  })

  it('blocks already cancelled', () => {
    const res = assessOrderCancel({ status: 'CANCELLED' })
    assert.equal(res.allowed, false)
    if (!res.allowed) assert.equal(res.code, 'ALREADY_CANCELLED')
  })

  it('blocks shipped / labeled orders', () => {
    for (const input of [
      { status: 'SHIPPED', trackingNumber: null },
      { status: 'COMPLETED', trackingNumber: null },
      { status: 'SUBMITTED', trackingNumber: '7946…' },
      { status: 'SUBMITTED', shippingStatus: 'DELIVERED' },
    ]) {
      const res = assessOrderCancel(input)
      assert.equal(res.allowed, false, `expected block for ${JSON.stringify(input)}`)
      if (!res.allowed) assert.equal(res.code, 'ALREADY_SHIPPED')
    }
  })
})

describe('stripeReasonForCancel', () => {
  it('maps duplicate to Stripe duplicate', () => {
    assert.equal(stripeReasonForCancel('duplicate'), 'duplicate')
  })

  it('maps other cancel reasons to requested_by_customer', () => {
    for (const reason of ORDER_CANCEL_REASONS) {
      if (reason === 'duplicate') continue
      assert.equal(stripeReasonForCancel(reason), 'requested_by_customer')
    }
  })
})

describe('shouldCancelFulfillmentOnStripeRefund', () => {
  it('cancels only on full refund of a pre-ship order', () => {
    assert.deepEqual(
      shouldCancelFulfillmentOnStripeRefund({
        fullyRefunded: true,
        orderStatus: 'SUBMITTED',
        trackingNumber: null,
      }),
      { cancel: true }
    )
  })

  it('skips partial refunds', () => {
    assert.deepEqual(
      shouldCancelFulfillmentOnStripeRefund({
        fullyRefunded: false,
        orderStatus: 'SUBMITTED',
      }),
      { cancel: false, reason: 'partial_refund' }
    )
  })

  it('skips already shipped / cancelled orders', () => {
    assert.equal(
      shouldCancelFulfillmentOnStripeRefund({
        fullyRefunded: true,
        orderStatus: 'SHIPPED',
        trackingNumber: '1Z',
      }).cancel,
      false
    )
    assert.equal(
      shouldCancelFulfillmentOnStripeRefund({
        fullyRefunded: true,
        orderStatus: 'CANCELLED',
      }).cancel,
      false
    )
  })
})
