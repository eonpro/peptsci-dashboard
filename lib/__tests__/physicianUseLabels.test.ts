import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { rgb } from 'pdf-lib'
import { generatePeptSciLabelsPdf, PUO_GLYPH_PATHS } from '../labels/peptsciLabelPdf.ts'
import { TEMPLATE_PNG_B64 } from '../labels/embeddedAssets.ts'
import { VITAL_HEALTH_TEMPLATE_PNG_B64 } from '../labels/vitalHealthEmbeddedAssets.ts'
import { ELEMENT_LABS_TEMPLATE_PNG_B64 } from '../labels/elementLabsEmbeddedAssets.ts'
import { usesPhysicianUseLabels } from '../labels/brandKeys.ts'
import { generatePackingSlipPdf } from '../fulfillment/pdf.ts'
import type { PackingSlipData } from '../fulfillment/service.ts'
import { pdfShownStrings } from './pdf-probe.ts'

const LABELS = path.join(process.cwd(), 'public', 'labels')

/** PeptSci-face artwork: PeptSci plus the white labels built from its SVG. */
const FACES = [
  {
    name: 'PeptSci',
    svg: 'PEPTSCI LABEL SAMPLE.svg',
    png: 'peptsci-label-template.png',
    embedded: TEMPLATE_PNG_B64,
  },
  {
    name: 'Vital Health',
    svg: 'clients/vital-health/vital-health-label-empty.svg',
    png: 'clients/vital-health/vital-health-label-template.png',
    embedded: VITAL_HEALTH_TEMPLATE_PNG_B64,
  },
  {
    name: 'Element Labs',
    svg: 'clients/element-labs/element-labs-label-empty.svg',
    png: 'clients/element-labs/element-labs-label-template.png',
    embedded: ELEMENT_LABS_TEMPLATE_PNG_B64,
  },
]

function groupPaths(svg: string, id: string): string[] {
  const group = new RegExp(`<g id="${id}">([\\s\\S]*?)</g>`).exec(svg)
  assert.ok(group, `artwork has no <g id="${id}">`)
  return [...group[1].matchAll(/ d="([^"]+)"/g)].map((m) => m[1])
}

describe('PeptSci-face vial artwork', () => {
  for (const face of FACES) {
    test(`${face.name} prints PUO and the physician-use warning instead of RUO`, () => {
      const svg = readFileSync(path.join(LABELS, face.svg), 'utf8')
      assert.equal(groupPaths(svg, 'use-mark').length, 'PUO'.length)
      assert.equal(
        groupPaths(svg, 'use-warning').length,
        'PHYSICIANUSEONLYNOTFORCONSUMPTION'.length
      )
      assert.ok(!svg.includes('M36.87,37.14'), 'baked RUO outline is gone')
      assert.ok(!svg.includes('M88.2,44.87'), 'baked PROVIDER USE ONLY outline is gone')
    })

    test(`${face.name} bundled template is the rebuilt artwork (Vercel prints from it)`, () => {
      const onDisk = readFileSync(path.join(LABELS, face.png)).toString('base64')
      assert.ok(face.embedded === onDisk, 'embedded base64 drifted from the template PNG')
    })
  }

  test('two-line labels redraw the exact PUO outlines from the artwork', () => {
    const svg = readFileSync(path.join(LABELS, FACES[0].svg), 'utf8')
    assert.deepEqual([...PUO_GLYPH_PATHS], groupPaths(svg, 'use-mark'))
  })
})

describe('vector fallback label', () => {
  test('prints PUO and the physician-use warning when no artwork is available', async () => {
    // An empty theme template forces the last-resort vector label.
    const { pdf, labelsPrinted } = await generatePeptSciLabelsPdf(
      [
        {
          req: {
            productName: 'Tesamorelin',
            dose: '10mg',
            purity: '99%HPLC',
            batchNumber: 'TES-10',
            budIsoDate: '2027-07-21',
          },
          quantity: 1,
        },
      ],
      {
        theme: {
          boxBlue: rgb(0.18, 0.18, 0.5),
          defaultAccent: rgb(0.17, 0.17, 0.52),
          templateCandidates: [],
          templatePngB64: '',
        },
      }
    )
    assert.equal(labelsPrinted, 1)
    const text = pdfShownStrings(pdf)
    assert.ok(text.includes('PUO'))
    assert.ok(text.includes('PHYSICIAN USE ONLY'))
    assert.ok(text.includes('NOT FOR CONSUMPTION'))
    assert.ok(!text.some((t) => /\bRUO\b|PROVIDER USE ONLY|HUMAN OR/.test(t)), text.join(' | '))
  })
})

describe('packing slip use notice', () => {
  const PHYSICIAN = 'Physician Use Only — Not for consumption.'
  const RESEARCH = 'Research Use Only — Not for human or animal consumption.'

  function slip(labelBrandKey: string | null): PackingSlipData {
    return {
      orderId: 'ord_1',
      orderNumber: 1042,
      createdAt: '2026-09-01T12:00:00.000Z',
      carrier: null,
      trackingNumber: null,
      client: { organizationName: 'Clinic', contactName: 'Dr. Smith', contactPhone: null },
      shippingAddress: { address1: '12 Main St', city: 'Tampa', state: 'FL', zip: '33602' },
      shipSpeed: 'TWO_DAY',
      lines: [{ productName: 'BPC-157', dose: '5mg', sku: 'BPC5', quantity: 2 }],
      totalUnits: 2,
      labelBrandKey,
    }
  }

  for (const brand of [null, 'vital_health', 'element_labs']) {
    test(`${brand ?? 'PeptSci'} slips match the physician-use vials in the box`, async () => {
      assert.equal(usesPhysicianUseLabels(brand), true)
      const text = pdfShownStrings(await generatePackingSlipPdf(slip(brand)))
      assert.ok(text.includes(PHYSICIAN))
      assert.ok(!text.includes(RESEARCH))
    })
  }

  for (const brand of ['livbetr', 'elevated_vitality']) {
    test(`${brand} slips keep the research-use wording printed on its vials`, async () => {
      assert.equal(usesPhysicianUseLabels(brand), false)
      const text = pdfShownStrings(await generatePackingSlipPdf(slip(brand)))
      assert.ok(text.includes(RESEARCH))
      assert.ok(!text.includes(PHYSICIAN))
    })
  }
})
