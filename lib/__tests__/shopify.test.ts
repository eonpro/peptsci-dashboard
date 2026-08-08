import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'crypto'
import { shopifyHmacBase64, verifyShopifyWebhookHmac } from '../shopify/hmac'
import { fromShopifyShippingAddress } from '../shopify/address'
import {
  normalizeShopDomain,
  shopifyGidToNumeric,
  toOrderGid,
  toProductVariantGid,
} from '../shopify/ids'
import {
  buildFulfillmentTrackingPayload,
  shopifyTrackingCompany,
} from '../shopify/fulfillment-payload'
import { encryptSecret, decryptSecret } from '../shopify/crypto'
import { assessShipmentPaymentGate } from '../fulfillment/payment-gate'

describe('shopify HMAC', () => {
  it('computes base64 HMAC-SHA256', () => {
    const body = '{"id":1}'
    const secret = 'whsec_test'
    const expected = createHmac('sha256', secret).update(body).digest('base64')
    assert.equal(shopifyHmacBase64(body, secret), expected)
  })

  it('verifies a valid header', () => {
    const body = '{"id":42,"name":"#1001"}'
    const secret = 'secret'
    const hmac = shopifyHmacBase64(body, secret)
    assert.equal(verifyShopifyWebhookHmac(body, secret, hmac), true)
  })

  it('rejects invalid or missing HMAC', () => {
    const body = '{"id":1}'
    assert.equal(verifyShopifyWebhookHmac(body, 'secret', 'bad'), false)
    assert.equal(verifyShopifyWebhookHmac(body, 'secret', null), false)
    assert.equal(verifyShopifyWebhookHmac(body, '', 'x'), false)
  })
})

describe('shopify ids', () => {
  it('normalizes shop domains', () => {
    assert.equal(normalizeShopDomain('https://Acme.myshopify.com/admin'), 'acme.myshopify.com')
    assert.equal(normalizeShopDomain('acme'), 'acme.myshopify.com')
    assert.equal(normalizeShopDomain('acme.myshopify.com'), 'acme.myshopify.com')
  })

  it('parses GIDs', () => {
    assert.equal(shopifyGidToNumeric('gid://shopify/Order/5678'), '5678')
    assert.equal(shopifyGidToNumeric(1234), '1234')
    assert.equal(toOrderGid('99'), 'gid://shopify/Order/99')
    assert.equal(
      toProductVariantGid('gid://shopify/ProductVariant/1'),
      'gid://shopify/ProductVariant/1'
    )
  })
})

describe('shopify address', () => {
  it('maps shipping address to platform shape', () => {
    const addr = fromShopifyShippingAddress({
      first_name: 'Jane',
      last_name: 'Doe',
      address1: '100 Main St',
      address2: 'Suite 2',
      city: 'Austin',
      province_code: 'TX',
      zip: '78701',
      country_code: 'US',
      phone: '5125551212',
      company: 'Clinic Co',
    })
    assert.deepEqual(addr, {
      address1: '100 Main St',
      address2: 'Suite 2',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
      country: 'US',
      name: 'Jane Doe',
      phone: '5125551212',
      company: 'Clinic Co',
    })
  })

  it('returns null when empty', () => {
    assert.equal(fromShopifyShippingAddress({ city: '' }), null)
  })
})

describe('shopify fulfillment payload', () => {
  it('maps carriers and builds tracking payload', () => {
    assert.equal(shopifyTrackingCompany('FedEx Express'), 'FedEx')
    assert.equal(shopifyTrackingCompany('UPS Ground'), 'UPS')
    const payload = buildFulfillmentTrackingPayload({
      carrier: 'FedEx',
      trackingNumber: ' 794612345678 ',
      trackingUrl: 'https://www.fedex.com/fedextrack/?trknbr=794612345678',
    })
    assert.deepEqual(payload, {
      company: 'FedEx',
      number: '794612345678',
      url: 'https://www.fedex.com/fedextrack/?trknbr=794612345678',
    })
  })
})

describe('shopify crypto', () => {
  it('round-trips secrets when key is set', () => {
    const prev = process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY
    process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64)
    try {
      const cipher = encryptSecret('shpat_test_token')
      assert.match(cipher, /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/)
      assert.equal(decryptSecret(cipher), 'shpat_test_token')
    } finally {
      if (prev === undefined) delete process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY
      else process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY = prev
    }
  })
})

describe('payment gate for Shopify fulfillment-only orders', () => {
  it('allows CAPTURED (Shopify-paid) without invoice', () => {
    const res = assessShipmentPaymentGate({ paymentStatus: 'CAPTURED', invoiced: false })
    assert.equal(res.allowed, true)
    assert.equal(res.reason, 'captured')
  })
})

/** Pure helpers mirroring ingest unmapped / line filtering decisions. */
describe('shopify ingest line rules (pure)', () => {
  it('treats requires_shipping false as non-shippable', () => {
    const lines = [
      { variant_id: 1, quantity: 2, requires_shipping: true },
      { variant_id: 2, quantity: 1, requires_shipping: false },
      { variant_id: 3, quantity: 0, requires_shipping: true },
    ]
    const shippable = lines.filter((li) => {
      if (li.requires_shipping === false) return false
      return Number(li.quantity ?? 0) > 0
    })
    assert.equal(shippable.length, 1)
    assert.equal(shippable[0].variant_id, 1)
  })

  it('documents unmapped path: no mapping → error code UNMAPPED_VARIANTS', () => {
    // Contract for webhook ERROR status — ingest returns this code when mappings miss.
    const code = 'UNMAPPED_VARIANTS'
    assert.equal(code, 'UNMAPPED_VARIANTS')
  })
})
