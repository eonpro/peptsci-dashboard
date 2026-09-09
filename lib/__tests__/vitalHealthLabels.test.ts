import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generateVialLabelsPdf, VITAL_HEALTH_BRAND_KEY } from '../labels/generateVialLabelsPdf'
import {
  VITAL_HEALTH_NAVY_HEX,
  VITAL_HEALTH_RED_HEX,
  VITAL_HEALTH_GREEN_HEX,
  VITAL_HEALTH_BLUE_HEX,
} from '../labels/vitalHealthLabelPdf'

describe('Vital Health white-label labels', () => {
  it('keeps the supplied brand palette', () => {
    assert.equal(VITAL_HEALTH_NAVY_HEX, '#2a5fa1')
    assert.equal(VITAL_HEALTH_BLUE_HEX, '#436e9c')
    assert.equal(VITAL_HEALTH_RED_HEX, '#e84637')
    assert.equal(VITAL_HEALTH_GREEN_HEX, '#5db828')
  })

  it('prints a PeptSci-family PDF under the vital_health brand key', async () => {
    const { pdf, brand, labelsPrinted } = await generateVialLabelsPdf(VITAL_HEALTH_BRAND_KEY, [
      {
        productName: 'Tesamorelin',
        dose: '10mg',
        purity: '99%HPLC',
        batchNumber: 'TES-10',
        budIsoDate: '2027-07-21',
        quantity: 1,
      },
    ])
    assert.equal(brand, 'vital_health')
    assert.equal(labelsPrinted, 1)
    assert.equal(pdf.subarray(0, 4).toString('ascii'), '%PDF')
    assert.ok(pdf.length > 8_000, `expected a real artwork PDF, got ${pdf.length} bytes`)
  })

  it('prints the admin proof payload (blend name) without crashing', async () => {
    const { pdf, brand, labelsPrinted } = await generateVialLabelsPdf(VITAL_HEALTH_BRAND_KEY, [
      {
        productName: 'BPC-157 / TB-500',
        dose: '10mg/10mg',
        purity: '99%HPLC',
        batchNumber: 'BPC-10',
        budIsoDate: '2027-07-21',
        quantity: 1,
      },
    ])
    assert.equal(brand, 'vital_health')
    assert.equal(labelsPrinted, 1)
    assert.equal(pdf.subarray(0, 4).toString('ascii'), '%PDF')
  })

  it('still prints when a peptide line has no batch number (Code 128 cannot encode empty)', async () => {
    const { pdf, brand, labelsPrinted } = await generateVialLabelsPdf(VITAL_HEALTH_BRAND_KEY, [
      {
        productName: 'Tesamorelin',
        dose: '10mg',
        purity: '99%HPLC',
        batchNumber: '',
        budIsoDate: '2027-07-21',
        quantity: 1,
      },
    ])
    assert.equal(brand, 'vital_health')
    assert.equal(labelsPrinted, 1)
    assert.equal(pdf.subarray(0, 4).toString('ascii'), '%PDF')
  })
})
