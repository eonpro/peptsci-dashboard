/**
 * Vital Health 2022 LLC white-label vial labels (OL4891LP 2.0" × 0.75").
 *
 * Same PeptSci overlay family (BUD date, product name, dose, Code 128, batch).
 * Artwork is the PeptSci face with the Vital Health logo and navy (#2a5fa1)
 * replacing indigo on the divider, purity band, and BATCH:.
 */

import path from 'node:path'
import { rgb } from 'pdf-lib'
import { VITAL_HEALTH_TEMPLATE_PNG_B64 } from './vitalHealthEmbeddedAssets'
import {
  generatePeptSciLabelsPdf,
  generatePeptSciLabelSheetPdf,
  type PeptSciLabelEngineOptions,
  type PeptSciLabelGroup,
  type PeptSciLabelRequest,
  type PeptSciLabelTheme,
} from './peptsciLabelPdf'

/** Primary navy — divider, purity band, BUD day, BATCH value. */
export const VITAL_HEALTH_NAVY_HEX = '#2a5fa1'
export const VITAL_HEALTH_BLUE_HEX = '#436e9c'
export const VITAL_HEALTH_RED_HEX = '#e84637'
export const VITAL_HEALTH_GREEN_HEX = '#5db828'

const VITAL_HEALTH_NAVY = rgb(0x2a / 255, 0x5f / 255, 0xa1 / 255)

export const VITAL_HEALTH_LABEL_THEME: PeptSciLabelTheme = {
  boxBlue: VITAL_HEALTH_NAVY,
  defaultAccent: VITAL_HEALTH_NAVY,
  templateCandidates: [
    path.join(
      process.cwd(),
      'public',
      'labels',
      'clients',
      'vital-health',
      'vital-health-label-template.png'
    ),
  ],
  templatePngB64: VITAL_HEALTH_TEMPLATE_PNG_B64,
  logoCandidates: [
    path.join(process.cwd(), 'public', 'brand', 'vital-health-logo-dark.png'),
    path.join(process.cwd(), 'assets', 'brand', 'vital-health-logo-dark.png'),
  ],
}

export type VitalHealthLabelRequest = PeptSciLabelRequest
export type VitalHealthLabelGroup = PeptSciLabelGroup

function withNavyAccent(groups: VitalHealthLabelGroup[]): VitalHealthLabelGroup[] {
  return groups.map((group) => ({
    ...group,
    req: {
      ...group.req,
      accentColor: group.req.accentColor ?? VITAL_HEALTH_NAVY_HEX,
    },
  }))
}

export async function generateVitalHealthLabelsPdf(
  groups: VitalHealthLabelGroup[],
  options?: Omit<PeptSciLabelEngineOptions, 'theme'>
) {
  return generatePeptSciLabelsPdf(withNavyAccent(groups), {
    ...options,
    theme: VITAL_HEALTH_LABEL_THEME,
  })
}

export async function generateVitalHealthLabelSheetPdf(
  input: VitalHealthLabelRequest,
  options?: Omit<PeptSciLabelEngineOptions, 'theme'>
) {
  const { pdf } = await generatePeptSciLabelSheetPdf(
    { ...input, accentColor: input.accentColor ?? VITAL_HEALTH_NAVY_HEX },
    { ...options, theme: VITAL_HEALTH_LABEL_THEME }
  )
  return pdf
}
