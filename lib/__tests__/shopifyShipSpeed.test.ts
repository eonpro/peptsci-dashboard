import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mapShopifyShipSpeed } from '../shopify/ship-speed.ts'

describe('mapShopifyShipSpeed', () => {
  test('defaults to TWO_DAY when lines are missing or empty', () => {
    assert.equal(mapShopifyShipSpeed(undefined), 'TWO_DAY')
    assert.equal(mapShopifyShipSpeed(null), 'TWO_DAY')
    assert.equal(mapShopifyShipSpeed([]), 'TWO_DAY')
  })

  test('maps overnight / next-day style titles to OVERNIGHT', () => {
    assert.equal(mapShopifyShipSpeed([{ title: 'Overnight Shipping' }]), 'OVERNIGHT')
    assert.equal(mapShopifyShipSpeed([{ title: 'Next Day Delivery' }]), 'OVERNIGHT')
    assert.equal(mapShopifyShipSpeed([{ title: 'Next-Day Air' }]), 'OVERNIGHT')
    assert.equal(mapShopifyShipSpeed([{ title: 'FedEx Priority Overnight' }]), 'OVERNIGHT')
    assert.equal(mapShopifyShipSpeed([{ code: 'overnight' }]), 'OVERNIGHT')
    assert.equal(mapShopifyShipSpeed([{ title: '1-Day Express' }]), 'OVERNIGHT')
  })

  test('maps standard / 2-day titles to TWO_DAY', () => {
    assert.equal(mapShopifyShipSpeed([{ title: '2-Day Shipping' }]), 'TWO_DAY')
    assert.equal(mapShopifyShipSpeed([{ title: 'Standard Shipping' }]), 'TWO_DAY')
    assert.equal(mapShopifyShipSpeed([{ title: 'Economy' }]), 'TWO_DAY')
  })

  test('uses the first overnight match when multiple lines exist', () => {
    assert.equal(
      mapShopifyShipSpeed([
        { title: 'Standard' },
        { title: 'Overnight' },
      ]),
      'OVERNIGHT'
    )
  })
})
