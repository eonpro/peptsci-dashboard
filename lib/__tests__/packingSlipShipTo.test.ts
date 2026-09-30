import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { generatePackingSlipPdf } from '../fulfillment/pdf.ts'
import type { PackingSlipData } from '../fulfillment/service.ts'
import { pdfShownStrings } from './pdf-probe.ts'

/**
 * The packing slip goes in the box, so on a ship-to-patient order it has to be
 * addressed to the patient. Orders placed through the shop checkout used to
 * store only firstName/lastName in the address snapshot, which the slip ignored
 * — it printed the street with no name.
 */
function slip(overrides: Partial<PackingSlipData> = {}): PackingSlipData {
  return {
    orderId: 'ord_1',
    orderNumber: 1042,
    createdAt: '2026-09-01T12:00:00.000Z',
    carrier: null,
    trackingNumber: null,
    client: { organizationName: 'Element Labs', contactName: 'Carressa Ball', contactPhone: null },
    shippingAddress: {
      address1: '12 Main St',
      city: 'Denver',
      state: 'CO',
      zip: '80203',
      firstName: 'Jane',
      lastName: 'Doe',
    },
    shipSpeed: 'TWO_DAY',
    lines: [{ productName: 'BPC-157', dose: '5mg', sku: 'BPC5', quantity: 2 }],
    totalUnits: 2,
    labelBrandKey: null,
    ...overrides,
  }
}

async function shown(data: PackingSlipData): Promise<string[]> {
  return pdfShownStrings(await generatePackingSlipPdf(data))
}

describe('packing slip recipient', () => {
  test('addresses the slip to the patient when the service resolved a recipient', async () => {
    const text = await shown(slip({ shipTo: 'PATIENT', recipientName: 'Jane Doe' }))
    assert.ok(text.includes('SHIP TO'), 'ship-to heading')
    assert.ok(text.includes('Jane Doe'), 'patient name')
    assert.ok(text.includes('12 Main St'), 'street')
    assert.ok(text.includes('Denver, CO 80203'), 'city line')
  })

  test('still names the patient from a legacy firstName/lastName-only snapshot', async () => {
    const text = await shown(slip({ shipTo: 'PATIENT' }))
    assert.ok(text.includes('Jane Doe'), 'patient name read from the snapshot')
    assert.ok(!text.includes('Carressa Ball'), 'never the clinic contact on a patient shipment')
  })

  test('uses the resolved recipient when the snapshot names no one', async () => {
    const text = await shown(
      slip({
        shipTo: 'PATIENT',
        recipientName: 'Jane Doe',
        shippingAddress: { address1: '12 Main St', city: 'Denver', state: 'CO', zip: '80203' },
      })
    )
    assert.ok(text.includes('Jane Doe'))
  })

  test('practice orders keep the name on the address', async () => {
    const text = await shown(
      slip({
        shipTo: 'PRACTICE',
        shippingAddress: {
          name: 'Carressa Ball',
          address1: '99 Clinic Way',
          city: 'Tampa',
          state: 'FL',
          zip: '33602',
        },
      })
    )
    assert.ok(text.includes('Carressa Ball'))
    assert.ok(text.includes('99 Clinic Way'))
  })

  test('a name with characters outside WinAnsi cannot crash the slip', async () => {
    const text = await shown(slip({ shipTo: 'PATIENT', recipientName: 'Nguyễn Văn 🙂 An' }))
    assert.ok(text.some((t) => t.startsWith('Nguy') && t.endsWith('An')))
  })
})
