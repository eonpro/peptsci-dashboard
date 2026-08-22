import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  allocateBookProductId,
  buildCatalogBookManifest,
  catalogBookCategories,
  catalogBookMeta,
  formatListPrice,
  isOfferedProduct,
  offeredSizeOptions,
  slugifyBookId,
} from '../catalog-book'
import type { ShopProduct } from '../types/shop'

function product(partial: Partial<ShopProduct> & Pick<ShopProduct, 'name' | 'sku'>): ShopProduct {
  return {
    id: partial.sku,
    dose: partial.dose ?? '10mg',
    description: null,
    category: null,
    displayPrice: 50,
    images: [],
    status: 'ACTIVE',
    ...partial,
  }
}

describe('slugifyBookId', () => {
  it('normalizes names for hash links', () => {
    assert.equal(slugifyBookId('BPC-157 / TB-500'), 'bpc-157-tb-500')
    assert.equal(slugifyBookId('NAD+'), 'nad')
  })
})

describe('offeredSizeOptions', () => {
  it('drops sizes with no SKU', () => {
    const p = product({
      name: 'Tirzepatide',
      sku: 'TZ-10',
      sizeOptions: [
        { sku: 'TZ-10', dose: '10mg', displayPrice: 90 },
        { sku: '  ', dose: '20mg', displayPrice: 120 },
        { sku: '', dose: '30mg', displayPrice: 160 },
      ],
    })
    const sizes = offeredSizeOptions(p)
    assert.deepEqual(
      sizes.map((s) => s.sku),
      ['TZ-10']
    )
  })

  it('falls back to the single variant SKU when sizeOptions is absent', () => {
    const p = product({ name: 'BPC-157', sku: 'BPC-5', dose: '5mg', displayPrice: 50 })
    const sizes = offeredSizeOptions(p)
    assert.equal(sizes.length, 1)
    assert.equal(sizes[0].sku, 'BPC-5')
    assert.equal(sizes[0].dose, '5mg')
  })
})

describe('isOfferedProduct', () => {
  it('rejects discontinued products and products with no SKU', () => {
    assert.equal(
      isOfferedProduct(product({ name: 'Old', sku: 'OLD-1', status: 'DISCONTINUED' })),
      false
    )
    assert.equal(isOfferedProduct(product({ name: 'Ghost', sku: '' })), false)
  })

  it('accepts an ACTIVE product with a SKU', () => {
    assert.equal(isOfferedProduct(product({ name: 'BPC-157', sku: 'BPC-5' })), true)
  })
})

describe('allocateBookProductId', () => {
  it('keeps duplicate names unique', () => {
    const used = new Set<string>()
    assert.equal(allocateBookProductId('Sermorelin', 'SER-5', used), 'sermorelin')
    assert.equal(allocateBookProductId('Sermorelin', 'SER-10', used), 'sermorelin-2')
  })
})

describe('buildCatalogBookManifest', () => {
  it('emits only static pages when the catalog is empty', () => {
    const pages = buildCatalogBookManifest([])
    assert.deepEqual(
      pages.map((p) => p.id),
      ['cover', 'about', 'categories', 'shipping', 'white-label', 'back']
    )
    assert.equal(
      pages.every((p) => p.kind === 'static'),
      true
    )
  })

  it('omits discontinued products and SKU-less sizes; groups by live buckets', () => {
    const pages = buildCatalogBookManifest([
      product({
        name: 'Tirzepatide',
        sku: 'TZ-10',
        category: 'GLP-1 dual agonist',
        sizeOptions: [
          { sku: 'TZ-10', dose: '10mg', displayPrice: 90 },
          { sku: 'TZ-20', dose: '20mg', displayPrice: 120 },
        ],
      }),
      product({
        name: 'BPC-157',
        sku: 'BPC-5',
        sizeOptions: [{ sku: 'BPC-5', dose: '5mg', displayPrice: 50 }],
      }),
      product({ name: 'Retired', sku: 'RET-1', status: 'DISCONTINUED' }),
      product({ name: 'No Sku', sku: '' }),
    ])

    const kinds = pages.map((p) => `${p.kind}:${p.id}`)
    assert.deepEqual(kinds, [
      'static:cover',
      'static:about',
      'static:categories',
      'category:cat-weight-loss',
      'product:tirzepatide',
      'category:cat-recovery-repair',
      'product:bpc-157',
      'static:shipping',
      'static:white-label',
      'static:back',
    ])

    const tz = pages.find((p) => p.id === 'tirzepatide')
    assert.equal(tz?.kind, 'product')
    if (tz?.kind === 'product') {
      assert.deepEqual(
        offeredSizeOptions(tz.product).map((s) => s.sku),
        ['TZ-10', 'TZ-20']
      )
    }

    const cats = catalogBookCategories(pages)
    assert.deepEqual(
      cats.map((c) => c.pageId),
      ['cat-weight-loss', 'cat-recovery-repair']
    )
    assert.equal(
      cats.some((c) => c.bucket === 'Cognitive'),
      false
    )
  })

  it('does not invent PDF volume SKUs that are not in the live catalog', () => {
    const pages = buildCatalogBookManifest([
      product({
        name: 'Semaglutide',
        sku: 'SM-10',
        category: 'GLP-1',
        sizeOptions: [{ sku: 'SM-10', dose: '10mg', displayPrice: 140 }],
      }),
    ])
    const productPage = pages.find((p) => p.kind === 'product')
    assert.equal(productPage?.kind, 'product')
    if (productPage?.kind === 'product') {
      const skus = offeredSizeOptions(productPage.product).map((s) => s.sku)
      assert.deepEqual(skus, ['SM-10'])
      assert.equal(skus.includes('SM-5'), false)
      assert.equal(skus.includes('SM-30'), false)
    }
  })

  it('keeps TOC metadata aligned with page ids', () => {
    const pages = buildCatalogBookManifest([
      product({ name: 'NAD+', sku: 'NAD-100', category: 'Mitochondrial peptide' }),
    ])
    const meta = catalogBookMeta(pages)
    assert.equal(meta.length, pages.length)
    assert.deepEqual(
      meta.map((m) => m.id),
      pages.map((p) => p.id)
    )
  })
})

describe('formatListPrice', () => {
  it('hides zero and non-finite prices', () => {
    assert.equal(formatListPrice(0), null)
    assert.equal(formatListPrice(Number.NaN), null)
    assert.equal(formatListPrice(90), '$90.00')
  })
})
