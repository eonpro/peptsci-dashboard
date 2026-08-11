import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isStripeShippingLineDescription,
  mapStripeSaleLinesToConvert,
  parseStripeSaleLineItems,
} from '../fulfillment/stripe-line-map.ts'

const catalog = [
  { id: 'mots10', sku: 'MS10', productName: 'MOTS-c', dose: '10.0mg', available: 60 },
  { id: 'mots40', sku: 'MS40', productName: 'MOTS-c', dose: '40.0mg', available: 20 },
  { id: 'bpc', sku: 'BC10', productName: 'BPC-157', dose: '10.0mg', available: 40 },
]

describe('parseStripeSaleLineItems', () => {
  test('keeps valid rows and drops junk', () => {
    assert.deepEqual(
      parseStripeSaleLineItems([
        { product: 'MOTS-c 10mg', quantity: 2, amount: 110 },
        { product: '', quantity: 1, amount: 10 },
        { nope: true },
        { product: 'Overnight Shipping', quantity: 1, amount: 25 },
      ]),
      [
        { product: 'MOTS-c 10mg', quantity: 2, amount: 110 },
        { product: 'Overnight Shipping', quantity: 1, amount: 25 },
      ]
    )
  })
})

describe('isStripeShippingLineDescription', () => {
  test('detects shipping fee lines', () => {
    assert.equal(isStripeShippingLineDescription('Overnight Shipping'), true)
    assert.equal(isStripeShippingLineDescription('2-Day Shipping'), true)
    assert.equal(isStripeShippingLineDescription('Next-day shipping'), true)
    assert.equal(isStripeShippingLineDescription('MOTS-c 10mg'), false)
  })
})

describe('mapStripeSaleLinesToConvert', () => {
  test('preloads all Stripe products with charged unit prices and peels shipping', () => {
    const mapped = mapStripeSaleLinesToConvert(
      [
        { product: 'MOTS-c 10mg', quantity: 2, amount: 110 },
        { product: 'BPC-157 10mg', quantity: 1, amount: 80 },
        { product: 'Overnight Shipping', quantity: 1, amount: 25 },
      ],
      catalog
    )
    assert.equal(mapped.lines.length, 2)
    assert.equal(mapped.shipSpeed, 'OVERNIGHT')
    assert.equal(mapped.hasShippingLine, true)
    assert.equal(mapped.shippingTotal, 25)
    assert.deepEqual(mapped.unmatched, [])

    const mots = mapped.lines.find((l) => l.variantId === 'mots10')
    assert.ok(mots)
    assert.equal(mots.quantity, 2)
    assert.equal(mots.unitPrice, 55)
    assert.equal(mots.priceSource, 'manual')

    const bpc = mapped.lines.find((l) => l.variantId === 'bpc')
    assert.ok(bpc)
    assert.equal(bpc.unitPrice, 80)
  })

  test('normalizes 10mg vs 10.0mg catalog doses', () => {
    const mapped = mapStripeSaleLinesToConvert(
      [{ product: 'MOTS-c 40mg', quantity: 1, amount: 125 }],
      catalog
    )
    assert.equal(mapped.lines[0]?.variantId, 'mots40')
    assert.equal(mapped.lines[0]?.unitPrice, 125)
  })

  test('leaves ambiguous / unknown descriptions unmatched', () => {
    const mapped = mapStripeSaleLinesToConvert(
      [
        { product: 'MOTS-c', quantity: 1, amount: 55 },
        { product: 'Mystery Blend', quantity: 1, amount: 99 },
      ],
      catalog
    )
    assert.equal(mapped.lines.length, 0)
    assert.deepEqual(mapped.unmatched, ['MOTS-c', 'Mystery Blend'])
  })

  test('falls back to compact product label when lineItems empty', () => {
    const mapped = mapStripeSaleLinesToConvert([], catalog, {
      fallbackProduct: 'BPC-157 10mg +1 more',
      fallbackVials: 3,
      paidAmount: 300,
    })
    // "+1 more" stripped → only BPC matches; qty from vials
    assert.equal(mapped.lines.length, 1)
    assert.equal(mapped.lines[0]?.variantId, 'bpc')
    assert.equal(mapped.lines[0]?.quantity, 3)
    assert.equal(mapped.lines[0]?.unitPrice, 100)
  })
})
