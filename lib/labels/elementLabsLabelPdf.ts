/**
 * Element Labs USA white-label vial labels (OL4891LP 2.0" × 0.75").
 *
 * Same PeptSci overlay family (BUD date, product name, dose, Code 128, batch).
 * Artwork is the PeptSci face with the Element Labs mark and navy (#073162)
 * replacing indigo on the divider, purity band, and BATCH:.
 */

import path from 'node:path'
import { rgb } from 'pdf-lib'
import { ELEMENT_LABS_TEMPLATE_PNG_B64 } from './elementLabsEmbeddedAssets'
import {
  generatePeptSciLabelsPdf,
  generatePeptSciLabelSheetPdf,
  type PeptSciLabelEngineOptions,
  type PeptSciLabelGroup,
  type PeptSciLabelRequest,
  type PeptSciLabelTheme,
} from './peptsciLabelPdf'

/** Primary navy (sampled from the supplied logo) — divider, purity band, BUD day, BATCH value. */
export const ELEMENT_LABS_NAVY_HEX = '#073162'

const ELEMENT_LABS_NAVY = rgb(0x07 / 255, 0x31 / 255, 0x62 / 255)

export const ELEMENT_LABS_LABEL_THEME: PeptSciLabelTheme = {
  boxBlue: ELEMENT_LABS_NAVY,
  defaultAccent: ELEMENT_LABS_NAVY,
  templateCandidates: [
    path.join(
      process.cwd(),
      'public',
      'labels',
      'clients',
      'element-labs',
      'element-labs-label-template.png'
    ),
  ],
  templatePngB64: ELEMENT_LABS_TEMPLATE_PNG_B64,
  logoCandidates: [
    path.join(process.cwd(), 'public', 'brand', 'element-labs-logo-dark.png'),
    path.join(process.cwd(), 'assets', 'brand', 'element-labs-logo-dark.png'),
  ],
}

export type ElementLabsLabelRequest = PeptSciLabelRequest
export type ElementLabsLabelGroup = PeptSciLabelGroup

function withNavyAccent(groups: ElementLabsLabelGroup[]): ElementLabsLabelGroup[] {
  return groups.map((group) => ({
    ...group,
    req: {
      ...group.req,
      accentColor: group.req.accentColor ?? ELEMENT_LABS_NAVY_HEX,
    },
  }))
}

export async function generateElementLabsLabelsPdf(
  groups: ElementLabsLabelGroup[],
  options?: Omit<PeptSciLabelEngineOptions, 'theme'>
) {
  return generatePeptSciLabelsPdf(withNavyAccent(groups), {
    ...options,
    theme: ELEMENT_LABS_LABEL_THEME,
  })
}

export async function generateElementLabsLabelSheetPdf(
  input: ElementLabsLabelRequest,
  options?: Omit<PeptSciLabelEngineOptions, 'theme'>
) {
  const { pdf } = await generatePeptSciLabelSheetPdf(
    { ...input, accentColor: input.accentColor ?? ELEMENT_LABS_NAVY_HEX },
    { ...options, theme: ELEMENT_LABS_LABEL_THEME }
  )
  return pdf
}
