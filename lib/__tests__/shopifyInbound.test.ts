import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildShopifyInvoiceLines,
  inboundLinesFullyMapped,
} from '../shopify/inbound-core.ts'

describe('inboundLinesFullyMapped', () => {
  test('false when empty or any line missing variantId', () => {
    assert.equal(inboundLinesFullyMapped([]), false)
    assert.equal(inboundLinesFullyMapped([{ variantId: 'a' }, { variantId: null }]), false)
    assert.equal(inboundLinesFullyMapped([{ variantId: undefined }]), false)
  })

  test('true when every line has a variantId', () => {
    assert.equal(
      inboundLinesFullyMapped([{ variantId: 'a' }, { variantId: 'b' }]),
      true
    )
  })
})

describe('buildShopifyInvoiceLines', () => {
  test('builds product lines plus shipping when shipping > 0', () => {
    const built = buildShopifyInvoiceLines({
      lines: [
        { variantId: 'v1', description: 'Sema 10mg (SEMA-10)', quantity: 2, unitPrice: 50 },
        { variantId: 'v2', description: 'Tirz 5mg (TIRZ-5)', quantity: 1, unitPrice: 80 },
      ],
      shippingTotal: 25,
      shipSpeed: 'TWO_DAY',
      shopifyOrderName: '#1042',
    })
    assert.equal(built.subtotal, 180)
    assert.equal(built.shippingTotal, 25)
    assert.equal(built.total, 205)
    assert.equal(built.lineItems.length, 3)
    assert.equal(built.lineItems[2].description, '2-day shipping — #1042')
    assert.equal(built.lineItems[2].unitPrice, 25)
  })

  test('omits shipping line when shipping is 0', () => {
    const built = buildShopifyInvoiceLines({
      lines: [{ variantId: 'v1', description: 'Sema', quantity: 1, unitPrice: 600 }],
      shippingTotal: 0,
      shipSpeed: 'OVERNIGHT',
      shopifyOrderName: '#1',
    })
    assert.equal(built.lineItems.length, 1)
    assert.equal(built.total, 600)
  })

  test('labels overnight shipping as Next-day', () => {
    const built = buildShopifyInvoiceLines({
      lines: [{ variantId: 'v1', description: 'X', quantity: 1, unitPrice: 10 }],
      shippingTotal: 35,
      shipSpeed: 'OVERNIGHT',
      shopifyOrderName: '#9',
    })
    assert.match(built.lineItems[1].description, /Next-day shipping/)
  })
})
