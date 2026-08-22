import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { bucketForProduct } from '../shop-categories'

describe('bucketForProduct growth-hormone lineup', () => {
  it('places secretagogues, GHRH analogs, blends, and hGH in Growth Hormone', () => {
    const cases: Array<[string, string]> = [
      ['Peptides', 'Tesamorelin'],
      ['Peptides', 'Ipamorelin'],
      ['Peptides', 'CJC-1295 (no DAC)'],
      ['Peptides', 'CJC-125'],
      ['Peptides', 'Sermorelin'],
      ['Blends', 'Tesamorelin / Ipamorelin'],
      ['Peptides', 'hGH'],
      ['Peptides', 'HGH'],
      ['Peptides', 'Somatropin'],
    ]
    for (const [category, name] of cases) {
      assert.equal(
        bucketForProduct(category, name),
        'Growth Hormone',
        `${name} should bucket as Growth Hormone`
      )
    }
  })

  it('does not steal AOD-9604 from Weight Loss', () => {
    assert.equal(bucketForProduct('Peptides', 'AOD-9604'), 'Weight Loss')
  })
})

describe('bucketForProduct skin & beauty lineup', () => {
  it('places GLOW and KLOW with GHK-Cu and melanotan in Skin & Beauty', () => {
    const cases: Array<[string, string]> = [
      ['Peptides', 'GLOW'],
      ['Blends', 'KLOW'],
      ['Peptides', 'Glow 70'],
      ['Peptides', 'KLOW-80'],
      ['Blends', 'GHK-Cu and BPC-157 and TB-500'],
      ['Blends', 'GHK-Cu and BPC-157 and TB-500 and KPV'],
      ['Peptides', 'GHK-Cu'],
      ['Peptides', 'MT-2 (Melanotan II Acetate)'],
    ]
    for (const [category, name] of cases) {
      assert.equal(
        bucketForProduct(category, name),
        'Skin & Beauty',
        `${name} should bucket as Skin & Beauty`
      )
    }
  })

  it('leaves standalone repair peptides in Recovery & Repair', () => {
    assert.equal(bucketForProduct('Peptides', 'BPC-157'), 'Recovery & Repair')
    assert.equal(bucketForProduct('Peptides', 'TB-500'), 'Recovery & Repair')
    assert.equal(bucketForProduct('Peptides', 'KPV'), 'Recovery & Repair')
  })
})
