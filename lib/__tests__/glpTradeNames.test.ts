import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { displayProductAka, displayProductName } from '../products/named-blends'
import {
  glpGenericName,
  glpSearchHaystack,
  resolveGlpTradeName,
  rewriteGlpInnNames,
} from '../products/glp-trade-names'
import { getMonographForName } from '../content/peptide-monographs'
import { bucketForProduct } from '../shop-categories'
import { filterProducts } from '../types/shop'
import type { ShopProduct } from '../types/shop'

describe('resolveGlpTradeName', () => {
  it('maps INN names and already-coded trade names', () => {
    assert.equal(resolveGlpTradeName('Semaglutide'), 'GLP-SM')
    assert.equal(resolveGlpTradeName('tirzepatide'), 'GLP-TZ')
    assert.equal(resolveGlpTradeName('Retatrutide'), 'GLP-RT')
    assert.equal(resolveGlpTradeName('GLP-SM'), 'GLP-SM')
    assert.equal(resolveGlpTradeName('GLP-TZ'), 'GLP-TZ')
    assert.equal(resolveGlpTradeName('GLP-RT'), 'GLP-RT')
  })

  it('maps frozen batch titles, legacy GLP-R, and SKUs', () => {
    assert.equal(resolveGlpTradeName('Retatrutide -- 3mL - 99% HPLC'), 'GLP-RT')
    assert.equal(resolveGlpTradeName('Tirzepatide 60.0mg'), 'GLP-TZ')
    assert.equal(resolveGlpTradeName('GLP-R 30'), 'GLP-RT')
    assert.equal(resolveGlpTradeName('GLP-R'), 'GLP-RT')
    assert.equal(resolveGlpTradeName('', 'RT30'), 'GLP-RT')
    assert.equal(resolveGlpTradeName('Received batch', 'SM5'), 'GLP-SM')
    assert.equal(resolveGlpTradeName('', 'TR60'), 'GLP-TZ')
    assert.equal(resolveGlpTradeName('', 'SEMAX-10'), null)
  })

  it('does not steal unrelated peptides', () => {
    assert.equal(resolveGlpTradeName('AOD-9604'), null)
    assert.equal(resolveGlpTradeName('Cagrilintide'), null)
    assert.equal(resolveGlpTradeName('GLOW'), null)
    assert.equal(resolveGlpTradeName('GLP-1 / GIP analog', 'BPC-10'), null)
  })
})

describe('displayProductName / aka for GLP trade names', () => {
  it('shows GLP-SM / GLP-TZ / GLP-RT and does not surface the INN as aka', () => {
    assert.equal(displayProductName('Semaglutide'), 'GLP-SM')
    assert.equal(displayProductAka('Semaglutide', 'SM5', null), null)
    assert.equal(displayProductName('Tirzepatide', 'TZ-10'), 'GLP-TZ')
    assert.equal(displayProductAka('Tirzepatide', 'TZ-10', null), null)
    assert.equal(displayProductName('Retatrutide -- 3mL - 99% HPLC', 'RT30'), 'GLP-RT')
    assert.equal(displayProductAka('Retatrutide', 'RT10', 'Retatrutide'), null)
    assert.equal(glpGenericName('GLP-SM'), 'Semaglutide')
  })

  it('keeps an explicit aka when it is not just the INN', () => {
    assert.equal(displayProductAka('Semaglutide', 'SM5', 'Ozempic analog'), 'Ozempic analog')
  })
})

describe('rewriteGlpInnNames / search haystack', () => {
  it('rewrites INN tokens inside free text', () => {
    assert.equal(rewriteGlpInnNames('Tirzepatide 60mg +1 more'), 'GLP-TZ 60mg +1 more')
    assert.equal(rewriteGlpInnNames('GLP-R 30'), 'GLP-RT 30')
  })

  it('lets search find either the INN or the trade name', () => {
    const hay = glpSearchHaystack('GLP-RT', 'RT30').toLowerCase()
    assert.match(hay, /retatrutide/)
    assert.match(hay, /glp-rt/)
    assert.match(hay, /glp-r/)
  })
})

describe('GLP trade names still resolve content', () => {
  it('keeps Weight Loss merchandising and monographs', () => {
    assert.equal(bucketForProduct('Peptides', 'GLP-SM'), 'Weight Loss')
    assert.equal(bucketForProduct('Peptides', 'GLP-TZ'), 'Weight Loss')
    assert.equal(bucketForProduct('Peptides', 'GLP-RT'), 'Weight Loss')
    assert.ok(getMonographForName('GLP-SM'))
    assert.ok(getMonographForName('GLP-TZ'))
    assert.ok(getMonographForName('GLP-RT'))
    assert.match(getMonographForName('GLP-SM')!.overview[0], /GLP-SM|Semaglutide/i)
  })

  it('lets shop search find GLP-SM by the INN even without aka', () => {
    const products = [
      {
        id: 'sm',
        sku: 'SM5',
        name: 'GLP-SM',
        aka: null,
        dose: '5mg',
        description: null,
        category: 'GLP-1',
        displayPrice: 75,
        images: [],
        status: 'ACTIVE',
      } satisfies ShopProduct,
    ]
    assert.equal(filterProducts(products, { search: 'semaglutide' }).length, 1)
    assert.equal(filterProducts(products, { search: 'glp-sm' }).length, 1)
  })
})
