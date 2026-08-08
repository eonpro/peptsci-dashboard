import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type Stripe from 'stripe'
import {
  fromStripeAddress,
  isCompleteStripeAddr,
  isIncompletePlatformAddress,
  preferredShipAddress,
  resolveStripeAddresses,
  salesRecordAddressFields,
  toPlatformShippingAddress,
} from '../stripe/resolve-address.ts'
import {
  planAddressApply,
  platformAddressFromSalesRecord,
} from '../stripe/apply-addresses.ts'

const hanford: Stripe.Address = {
  line1: '755 N Irwin',
  line2: 'Suite 2',
  city: 'Hanford',
  state: 'CA',
  postal_code: '93230',
  country: 'US',
}

const billingOnly: Stripe.Address = {
  line1: '1 Billing Rd',
  line2: null,
  city: 'Tampa',
  state: 'FL',
  postal_code: '33602',
  country: 'US',
}

describe('fromStripeAddress / completeness', () => {
  test('maps line2 and rejects empty objects', () => {
    const a = fromStripeAddress(hanford)
    assert.deepEqual(a, {
      line1: '755 N Irwin',
      line2: 'Suite 2',
      city: 'Hanford',
      state: 'CA',
      postal_code: '93230',
      country: 'US',
    })
    assert.equal(fromStripeAddress({ line1: null, line2: null, city: null, state: null, postal_code: null, country: null }), null)
    assert.equal(isCompleteStripeAddr(a), true)
    assert.equal(isCompleteStripeAddr({ ...a!, line1: '' }), false)
  })
})

describe('resolveStripeAddresses preference', () => {
  test('prefers invoice.customer_shipping over charge billing', () => {
    const { shipping, billing } = resolveStripeAddresses({
      pi: { shipping: null } as Stripe.PaymentIntent,
      charge: {
        billing_details: { address: billingOnly },
        shipping: null,
      } as unknown as Stripe.Charge,
      customer: null,
      invoice: {
        customer_shipping: { address: hanford, name: 'Ronnette Daulton' },
        customer_address: billingOnly,
      } as unknown as Stripe.Invoice,
    })
    assert.equal(shipping?.line1, '755 N Irwin')
    assert.equal(shipping?.line2, 'Suite 2')
    assert.equal(billing?.line1, '1 Billing Rd')
    assert.equal(preferredShipAddress({ shipping, billing })?.line1, '755 N Irwin')
  })

  test('falls back to PI.shipping then charge.shipping then customer.shipping', () => {
    const viaPi = resolveStripeAddresses({
      pi: { shipping: { address: hanford } } as Stripe.PaymentIntent,
      charge: { billing_details: { address: billingOnly }, shipping: null } as unknown as Stripe.Charge,
      customer: null,
      invoice: null,
    })
    assert.equal(viaPi.shipping?.city, 'Hanford')

    const viaCharge = resolveStripeAddresses({
      pi: { shipping: null } as Stripe.PaymentIntent,
      charge: {
        billing_details: { address: billingOnly },
        shipping: { address: hanford },
      } as unknown as Stripe.Charge,
      customer: null,
      invoice: null,
    })
    assert.equal(viaCharge.shipping?.city, 'Hanford')

    const viaCustomer = resolveStripeAddresses({
      pi: { shipping: null } as Stripe.PaymentIntent,
      charge: { billing_details: { address: null }, shipping: null } as unknown as Stripe.Charge,
      customer: { shipping: { address: hanford } } as unknown as Stripe.Customer,
      invoice: null,
    })
    assert.equal(viaCustomer.shipping?.city, 'Hanford')
  })

  test('billing-only when no shipping present', () => {
    const r = resolveStripeAddresses({
      pi: { shipping: null } as Stripe.PaymentIntent,
      charge: {
        billing_details: { address: billingOnly },
        shipping: null,
      } as unknown as Stripe.Charge,
      customer: null,
      invoice: null,
    })
    assert.equal(r.shipping, null)
    assert.equal(preferredShipAddress(r)?.line1, '1 Billing Rd')
  })
})

describe('salesRecord + platform mappers', () => {
  test('salesRecordAddressFields includes address2', () => {
    assert.deepEqual(salesRecordAddressFields(fromStripeAddress(hanford)), {
      address: '755 N Irwin',
      address2: 'Suite 2',
      city: 'Hanford',
      state: 'CA',
      zip: '93230',
    })
  })

  test('toPlatformShippingAddress + SalesRecord round-trip', () => {
    const parts = fromStripeAddress(hanford)!
    const platform = toPlatformShippingAddress(parts, {
      name: 'Ronnette Daulton',
      phone: '5595550100',
    })
    assert.equal(platform.address1, '755 N Irwin')
    assert.equal(platform.address2, 'Suite 2')
    assert.equal(platform.name, 'Ronnette Daulton')

    const fromRec = platformAddressFromSalesRecord({
      address: '755 N Irwin',
      address2: 'Suite 2',
      city: 'Hanford',
      state: 'CA',
      zip: '93230',
      customerName: 'Ronnette Daulton',
      customerPhone: '5595550100',
    })
    assert.deepEqual(fromRec, platform)
  })

  test('incomplete platform address detection', () => {
    assert.equal(isIncompletePlatformAddress(null), true)
    assert.equal(isIncompletePlatformAddress({}), true)
    assert.equal(
      isIncompletePlatformAddress({
        address1: '755 N Irwin',
        city: 'Hanford',
        state: 'CA',
        zip: '93230',
      }),
      false
    )
  })
})

describe('planAddressApply', () => {
  test('fills empty Client + Order from Stripe shipping; does not overwrite good Client addr', () => {
    const resolved = {
      shipping: fromStripeAddress(hanford),
      billing: fromStripeAddress(billingOnly),
    }
    const empty = planAddressApply({
      resolved,
      recipient: { name: 'Ronnette Daulton' },
      existingClientShipping: null,
      existingClientBilling: null,
      existingOrderShipping: null,
      forceOrderShipping: true,
    })
    assert.equal(empty.orderShipping?.address1, '755 N Irwin')
    assert.equal(empty.orderShipping?.name, 'Ronnette Daulton')
    assert.equal(empty.clientShipping?.address1, '755 N Irwin')
    assert.equal(empty.clientBilling?.address1, '1 Billing Rd')

    const keep = planAddressApply({
      resolved,
      existingClientShipping: {
        address1: '99 Kept St',
        city: 'Fresno',
        state: 'CA',
        zip: '93701',
      },
      existingClientBilling: {
        address1: '99 Kept St',
        city: 'Fresno',
        state: 'CA',
        zip: '93701',
      },
      existingOrderShipping: null,
      forceOrderShipping: true,
    })
    assert.equal(keep.clientShipping, null)
    assert.equal(keep.clientBilling, null)
    assert.equal(keep.orderShipping?.address1, '755 N Irwin')
  })
})
