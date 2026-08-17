/**
 * Vial-label brand dispatcher.
 * PeptSci is the default; white-label clients select a brand key.
 */

import {
  generatePeptSciLabelsPdf,
  type PeptSciLabelGroup,
} from './peptsciLabelPdf'
import {
  generateElevatedVitalityLabelsPdf,
  type ElevatedVitalityLabelGroup,
} from './elevatedVitalityLabelPdf'
import { generateLivbetrLabelsPdf, type LivbetrLabelGroup } from './livbetrLabelPdf'
import {
  ELEVATED_VITALITY_BRAND_KEY,
  LIVBETR_BRAND_KEY,
  type LabelBrandKey,
} from './brandKeys'

export {
  ELEVATED_VITALITY_BRAND_KEY,
  LIVBETR_BRAND_KEY,
  LABEL_BRAND_KEYS,
  LABEL_BRAND_OPTIONS,
  isLabelBrandKey,
  resolveLabelBrandKey,
  type LabelBrandKey,
} from './brandKeys'

export type VialLabelGroup = {
  productName: string
  dose: string
  purity: string
  batchNumber: string
  budIsoDate: string
  quantity: number
  accentColor?: string
}

export type VialLabelsPdfResult = {
  pdf: Buffer
  brand: 'peptsci' | LabelBrandKey
  startSlot: number
  nextStartSlot: number
  labelsPrinted: number
}

export async function generateVialLabelsPdf(
  brandKey: LabelBrandKey | null,
  groups: VialLabelGroup[],
  options?: { startSlot?: number }
): Promise<VialLabelsPdfResult> {
  const startSlot = options?.startSlot ?? 0

  if (brandKey === ELEVATED_VITALITY_BRAND_KEY) {
    const evGroups: ElevatedVitalityLabelGroup[] = groups.map((g) => ({
      req: {
        productName: g.productName,
        dose: g.dose,
        batchNumber: g.batchNumber,
        budIsoDate: g.budIsoDate,
      },
      quantity: g.quantity,
    }))
    const result = await generateElevatedVitalityLabelsPdf(evGroups, { startSlot })
    return { brand: ELEVATED_VITALITY_BRAND_KEY, ...result }
  }

  if (brandKey === LIVBETR_BRAND_KEY) {
    const livGroups: LivbetrLabelGroup[] = groups.map((g) => ({
      req: {
        productName: g.productName,
        dose: g.dose,
        purity: g.purity,
        batchNumber: g.batchNumber,
        budIsoDate: g.budIsoDate,
      },
      quantity: g.quantity,
    }))
    const result = await generateLivbetrLabelsPdf(livGroups, { startSlot })
    return { brand: LIVBETR_BRAND_KEY, ...result }
  }

  const peptsciGroups: PeptSciLabelGroup[] = groups.map((g) => ({
    req: {
      productName: g.productName,
      dose: g.dose,
      purity: g.purity,
      batchNumber: g.batchNumber,
      budIsoDate: g.budIsoDate,
      accentColor: g.accentColor,
    },
    quantity: g.quantity,
  }))
  const result = await generatePeptSciLabelsPdf(peptsciGroups, { startSlot })
  return { brand: 'peptsci', ...result }
}
