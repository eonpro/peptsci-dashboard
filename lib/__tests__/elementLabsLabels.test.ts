import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  generateVialLabelsPdf,
  ELEMENT_LABS_BRAND_KEY,
  isLabelBrandKey,
  resolveLabelBrandKey,
  LABEL_BRAND_OPTIONS,
} from '../labels/generateVialLabelsPdf'
import { ELEMENT_LABS_NAVY_HEX } from '../labels/elementLabsLabelPdf'

describe('Element Labs white-label labels', () => {
  it('keeps the supplied brand palette', () => {
    assert.equal(ELEMENT_LABS_NAVY_HEX, '#073162')
  })

  it('is a registered, selectable brand key', () => {
    assert.equal(isLabelBrandKey('element_labs'), true)
    assert.ok(LABEL_BRAND_OPTIONS.some((o) => o.key === ELEMENT_LABS_BRAND_KEY))
  })

  it('resolves when enabled and infers from the org name when never configured', () => {
    assert.equal(
      resolveLabelBrandKey({ whiteLabelEnabled: true, labelBrandKey: 'element_labs' }),
      'element_labs'
    )
    assert.equal(
      resolveLabelBrandKey({ organizationName: 'Element Labs USA' }),
      'element_labs'
    )
    // Chosen then disabled → PeptSci, even though the org name matches.
    assert.equal(
      resolveLabelBrandKey({
        whiteLabelEnabled: false,
        labelBrandKey: 'element_labs',
        organizationName: 'Element Labs USA',
      }),
      null
    )
  })

  it('prints a PeptSci-family PDF under the element_labs brand key', async () => {
    const { pdf, brand, labelsPrinted } = await generateVialLabelsPdf(ELEMENT_LABS_BRAND_KEY, [
      {
        productName: 'Tesamorelin',
        dose: '10mg',
        purity: '99%HPLC',
        batchNumber: 'TES-10',
        budIsoDate: '2027-07-21',
        quantity: 1,
      },
    ])
    assert.equal(brand, 'element_labs')
    assert.equal(labelsPrinted, 1)
    assert.equal(pdf.subarray(0, 4).toString('ascii'), '%PDF')
    assert.ok(pdf.length > 8_000, `expected a real artwork PDF, got ${pdf.length} bytes`)
  })
})
