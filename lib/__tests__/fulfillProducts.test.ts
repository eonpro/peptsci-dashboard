import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  mergeCatalogLinesForOrder,
  matchVariantIdFromDescription,
  platformInvoiceMintBlockReason,
} from '../invoicing/fulfill-products.ts'
import {
  correctMappedVariantForTitle,
  descriptionLooksLikeBlend,
} from '../invoicing/match-variant.ts'

describe('mergeCatalogLinesForOrder', () => {
  test('sums quantities for duplicate variants', () => {
    const merged = mergeCatalogLinesForOrder([
      { variantId: 'a', quantity: 2, unitPrice: 10 },
      { variantId: 'b', quantity: 1, unitPrice: 20 },
      { variantId: 'a', quantity: 3, unitPrice: 11 },
    ])
    assert.deepEqual(merged, [
      { variantId: 'a', quantity: 5, unitPrice: 10 },
      { variantId: 'b', quantity: 1, unitPrice: 20 },
    ])
  })
})

describe('platformInvoiceMintBlockReason', () => {
  test('blocks practice-address mint when the invoice is a Shopify inbound', () => {
    assert.equal(
      platformInvoiceMintBlockReason({ hasShopifyInbound: true }),
      'shopify_inbound'
    )
  })

  test('allows mint for ordinary admin product invoices', () => {
    assert.equal(platformInvoiceMintBlockReason({ hasShopifyInbound: false }), null)
  })
})

describe('matchVariantIdFromDescription', () => {
  const catalog = [
    { id: 'v1', sku: 'RT10', productName: 'Retatrutide', dose: '10.0mg' },
    { id: 'v2', sku: 'BC10', productName: 'BPC-157', dose: '10.0mg' },
  ]

  test('matches middot SKU label from NewInvoiceDialog', () => {
    assert.equal(
      matchVariantIdFromDescription('Retatrutide 10.0mg · RT10', catalog),
      'v1'
    )
  })

  test('matches dash-separated SKU labels', () => {
    assert.equal(
      matchVariantIdFromDescription('Retatrutide 10.0mg - RT10', catalog),
      'v1'
    )
  })

  test('matches bare SKU', () => {
    assert.equal(matchVariantIdFromDescription('BC10', catalog), 'v2')
  })

  test('normalizes 10mg vs 10.0mg', () => {
    assert.equal(
      matchVariantIdFromDescription('Retatrutide 10mg', catalog),
      'v1'
    )
  })

  test('returns null when unknown', () => {
    assert.equal(matchVariantIdFromDescription('Custom consulting fee', catalog), null)
  })

  test('maps a Shopify blend title to the blend SKU, not TB-500 10mg', () => {
    const withBlend = [
      ...catalog,
      { id: 'tb10', sku: 'TB-10', productName: 'TB-500', dose: '10.0mg' },
      {
        id: 'blend10',
        sku: 'BPC-TB-10',
        productName: 'BPC-157 / TB-500 Blend',
        dose: '10mg/10mg',
      },
      {
        id: 'blend5',
        sku: 'BPC-TB-5',
        productName: 'BPC-157 / TB-500 Blend',
        dose: '5mg/5mg',
      },
    ]
    assert.equal(
      matchVariantIdFromDescription('BPC-157 10MG+TB-500 10MG BLEND', withBlend),
      'blend10'
    )
    assert.equal(matchVariantIdFromDescription('TB-500 10mg', withBlend), 'tb10')
  })
})

describe('descriptionLooksLikeBlend', () => {
  test('detects plus-joined Shopify blend titles', () => {
    assert.equal(descriptionLooksLikeBlend('BPC-157 10MG+TB-500 10MG BLEND'), true)
    assert.equal(descriptionLooksLikeBlend('TB-500 10mg'), false)
  })
})

describe('correctMappedVariantForTitle', () => {
  const catalog = [
    { id: 'tb10', sku: 'TB-10', productName: 'TB-500', dose: '10mg' },
    {
      id: 'blend10',
      sku: 'BPC-TB-10',
      productName: 'BPC-157 / TB-500 Blend',
      dose: '10mg/10mg',
    },
  ]

  test('overrides a single-peptide mapping when the Shopify title is the blend', () => {
    assert.equal(
      correctMappedVariantForTitle('BPC-157 10MG+TB-500 10MG BLEND', 'tb10', catalog),
      'blend10'
    )
  })

  test('keeps a single-peptide mapping when the title is not a blend', () => {
    assert.equal(correctMappedVariantForTitle('TB-500 10mg', 'tb10', catalog), 'tb10')
  })
})
