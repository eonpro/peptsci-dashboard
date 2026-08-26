import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  variantToShopProduct,
  type AdminCatalogVariant,
} from '../products/admin-catalog'
import { groupProductsByParent } from '../types/shop'

function variant(
  partial: Partial<AdminCatalogVariant> & Pick<AdminCatalogVariant, 'id' | 'productName'>
): AdminCatalogVariant {
  return {
    sku: partial.sku ?? partial.id,
    productId: 'prod-1',
    category: null,
    dose: '10mg',
    srp: 80,
    unitCost: 20,
    supplierName: null,
    supplierSku: null,
    inventoryOnHand: 12,
    reorderLevel: 0,
    imageUrl: null,
    coaCount: 0,
    aka: null,
    purity: null,
    description: null,
    casNumber: null,
    molecularFormula: null,
    molecularWeight: null,
    pubchemCid: null,
    ...partial,
  }
}

describe('variantToShopProduct', () => {
  it('fills CAS / formula from verified chemistry when the DB row is blank', () => {
    const product = variantToShopProduct(
      variant({ id: 'v1', sku: 'BPC-10', productName: 'BPC-157' })
    )
    assert.equal(product.name, 'BPC-157')
    assert.equal(product.displayPrice, 80)
    assert.equal(product.casNumber, '137525-51-0')
    assert.equal(product.molecularFormula, 'C62H98N16O22')
    assert.equal(product.inStock, true)
    assert.equal(product.hasCoa, false)
  })

  it('keeps a stored CAS instead of overwriting it from the chemistry map', () => {
    const product = variantToShopProduct(
      variant({
        id: 'v1',
        sku: 'BPC-10',
        productName: 'BPC-157',
        casNumber: '000-00-0',
      })
    )
    assert.equal(product.casNumber, '000-00-0')
  })

  it('attaches blend compounds so the vial card can render GLOW like the shop', () => {
    const product = variantToShopProduct(
      variant({
        id: 'v-glow',
        sku: 'GLOW-70',
        productName: 'GLOW',
        dose: '70mg',
        productId: 'glow',
      })
    )
    assert.ok(product.compounds && product.compounds.length >= 3)
    assert.equal(product.productType, 'Blend')
  })

  it('applies BAC water list prices so 3mL / 10mL / 30mL are not the same SRP', () => {
    const three = variantToShopProduct(
      variant({
        id: 'bac-3',
        sku: 'BAC-H2O-3ML',
        productName: 'Bacteriostatic Water',
        dose: '3mL',
        srp: 5,
      })
    )
    const ten = variantToShopProduct(
      variant({
        id: 'bac-10',
        sku: 'BAC-H2O-10ML',
        productName: 'Bacteriostatic Water',
        dose: '10mL',
        srp: 5,
      })
    )
    const thirty = variantToShopProduct(
      variant({
        id: 'bac-30',
        sku: 'BAC-H20',
        productName: 'Bacteriostatic Water',
        dose: '30mL',
        srp: 5,
      })
    )
    assert.equal(three.displayPrice, 5)
    assert.equal(ten.displayPrice, 10)
    assert.equal(thirty.displayPrice, 20)
  })

  it('groups sibling sizes onto one catalog card', () => {
    const grouped = groupProductsByParent([
      variantToShopProduct(
        variant({ id: 'a', sku: 'SER-5', productName: 'Sermorelin', dose: '5mg', srp: 59 })
      ),
      variantToShopProduct(
        variant({ id: 'b', sku: 'SER-10', productName: 'Sermorelin', dose: '10mg', srp: 89 })
      ),
    ])
    assert.equal(grouped.length, 1)
    assert.deepEqual(
      grouped[0].sizeOptions?.map((s) => s.sku).sort(),
      ['SER-10', 'SER-5']
    )
  })
})
