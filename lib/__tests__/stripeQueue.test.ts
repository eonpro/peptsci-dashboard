import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { excludePlatformInvoiceQueueRows } from '../fulfillment/stripe-queue'

describe('excludePlatformInvoiceQueueRows', () => {
  test('keeps external Stripe orphans and drops InvoicePayment PIs', () => {
    const rows = [
      { id: 'a', stripePaymentIntentId: 'pi_external' },
      { id: 'b', stripePaymentIntentId: 'pi_invoice' },
      { id: 'c', stripePaymentIntentId: null },
    ]
    const kept = excludePlatformInvoiceQueueRows(rows, new Set(['pi_invoice']))
    assert.deepEqual(
      kept.map((r) => r.id),
      ['a', 'c']
    )
  })

  test('no platform set returns a shallow copy of all rows', () => {
    const rows = [{ id: 'a', stripePaymentIntentId: 'pi_1' }]
    const kept = excludePlatformInvoiceQueueRows(rows, new Set())
    assert.equal(kept.length, 1)
    assert.equal(kept[0]?.id, 'a')
    assert.notEqual(kept, rows)
  })
})
