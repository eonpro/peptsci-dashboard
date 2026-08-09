/**
 * Vial-label brand dispatcher.
 * PeptSci is the default; white-label clients select a brand key (e.g. elevated_vitality).
 */

import {
  generatePeptSciLabelsPdf,
  type PeptSciLabelGroup,
} from './peptsciLabelPdf'
import {
  generateElevatedVitalityLabelsPdf,
  type ElevatedVitalityLabelGroup,
} from './elevatedVitalityLabelPdf'
import {
  ELEVATED_VITALITY_BRAND_KEY,
  type LabelBrandKey,
} from './brandKeys'

export {
  ELEVATED_VITALITY_BRAND_KEY,
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

export async function generateVialLabelsPdf(
  brandKey: LabelBrandKey | null,
  groups: VialLabelGroup[]
): Promise<{ pdf: Buffer; brand: 'peptsci' | LabelBrandKey }> {
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
    return {
      pdf: await generateElevatedVitalityLabelsPdf(evGroups),
      brand: ELEVATED_VITALITY_BRAND_KEY,
    }
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
  return { pdf: await generatePeptSciLabelsPdf(peptsciGroups), brand: 'peptsci' }
}
