/**
 * Certificate of Analysis (COA) domain types, validation, and data access.
 *
 * COAs are supplier certificates attached to a specific ProductVariant. Admins
 * upload the original document (JPG/PDF) and hand-enter the structured results;
 * those values drive the styled certificate rendered on the storefront.
 */

import { z } from 'zod'
import { prisma } from './prisma'
import { logger } from './logger'

/**
 * Presentational shape consumed by the certificate renderer. Dates are ISO
 * strings (or null) so the object is safely serializable across the server →
 * client boundary. `fileUrl` is the proxy URL for the source document (set by
 * the page/route, never the raw blob URL).
 */
export interface CoaData {
  id: string
  variantId: string

  // Identity / header
  compoundName: string
  doseLabel: string | null
  casNumber: string | null
  appearance: string | null
  batchNumber: string | null
  taskNumber: string | null
  reportCode: string | null
  issuingLab: string | null
  signedBy: string | null

  // Parties
  manufacturer: string | null
  testingLab: string | null
  clientOfRecord: string | null
  distributor: string | null

  // Dates (ISO strings)
  orderedOn: string | null
  receivedOn: string | null
  analyzedOn: string | null

  // Purity
  purityPercent: number | null
  puritySpecMin: number | null
  purityRejectMax: number | null

  // Assay
  assayMeasuredMg: number | null
  assayLabelClaimMg: number | null

  // Identity confirmation
  identitySpec: string | null
  identityResult: string | null

  notes: string | null
  published: boolean

  // Source document
  hasFile: boolean
  fileName: string | null
  contentType: string | null
  /** Proxy URL to view/download the source document (set by caller). */
  fileUrl: string | null

  createdAt: string
  updatedAt: string
}

/** Minimal row shape returned by Prisma selects below. */
export interface CoaRow {
  id: string
  variantId: string
  compoundName: string
  doseLabel: string | null
  casNumber: string | null
  appearance: string | null
  batchNumber: string | null
  taskNumber: string | null
  reportCode: string | null
  issuingLab: string | null
  signedBy: string | null
  manufacturer: string | null
  testingLab: string | null
  clientOfRecord: string | null
  distributor: string | null
  orderedOn: Date | null
  receivedOn: Date | null
  analyzedOn: Date | null
  purityPercent: number | null
  puritySpecMin: number | null
  purityRejectMax: number | null
  assayMeasuredMg: number | null
  assayLabelClaimMg: number | null
  identitySpec: string | null
  identityResult: string | null
  notes: string | null
  published: boolean
  fileUrl: string | null
  fileBase64: string | null
  contentType: string | null
  fileName: string | null
  createdAt: Date
  updatedAt: Date
}

/** Scalar columns to select — deliberately excludes the heavy fileBase64. */
export const coaScalarSelect = {
  id: true,
  variantId: true,
  compoundName: true,
  doseLabel: true,
  casNumber: true,
  appearance: true,
  batchNumber: true,
  taskNumber: true,
  reportCode: true,
  issuingLab: true,
  signedBy: true,
  manufacturer: true,
  testingLab: true,
  clientOfRecord: true,
  distributor: true,
  orderedOn: true,
  receivedOn: true,
  analyzedOn: true,
  purityPercent: true,
  puritySpecMin: true,
  purityRejectMax: true,
  assayMeasuredMg: true,
  assayLabelClaimMg: true,
  identitySpec: true,
  identityResult: true,
  notes: true,
  published: true,
  fileUrl: true,
  contentType: true,
  fileName: true,
  createdAt: true,
  updatedAt: true,
} as const

const iso = (d: Date | null | undefined): string | null => (d ? new Date(d).toISOString() : null)

/**
 * Map a Prisma row to the serializable CoaData. `fileUrl` here is the proxy URL
 * the caller supplies (e.g. `/api/shop/coa/:id/file`), NOT the raw blob URL.
 */
export function toCoaData(
  row: Omit<CoaRow, 'fileBase64'> & { fileBase64?: string | null },
  fileUrl: string | null
): CoaData {
  return {
    id: row.id,
    variantId: row.variantId,
    compoundName: row.compoundName,
    doseLabel: row.doseLabel,
    casNumber: row.casNumber,
    appearance: row.appearance,
    batchNumber: row.batchNumber,
    taskNumber: row.taskNumber,
    reportCode: row.reportCode,
    issuingLab: row.issuingLab,
    signedBy: row.signedBy,
    manufacturer: row.manufacturer,
    testingLab: row.testingLab,
    clientOfRecord: row.clientOfRecord,
    distributor: row.distributor,
    orderedOn: iso(row.orderedOn),
    receivedOn: iso(row.receivedOn),
    analyzedOn: iso(row.analyzedOn),
    purityPercent: row.purityPercent,
    puritySpecMin: row.puritySpecMin,
    purityRejectMax: row.purityRejectMax,
    assayMeasuredMg: row.assayMeasuredMg,
    assayLabelClaimMg: row.assayLabelClaimMg,
    identitySpec: row.identitySpec,
    identityResult: row.identityResult,
    notes: row.notes,
    published: row.published,
    hasFile: !!(row.fileUrl || row.fileBase64),
    fileName: row.fileName,
    contentType: row.contentType,
    fileUrl,
    createdAt: iso(row.createdAt)!,
    updatedAt: iso(row.updatedAt)!,
  }
}

// -------------------------------------------------
// Validation (shared by create/update API routes)
// -------------------------------------------------

const optionalString = z
  .string()
  .trim()
  .max(4000)
  .optional()
  .nullable()
  .transform((v) => (v && v.length > 0 ? v : null))

const optionalNumber = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
  .transform((v) => {
    if (v === null || v === undefined || v === '') return null
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) ? n : null
  })

const optionalDate = z
  .string()
  .optional()
  .nullable()
  .transform((v) => {
    if (!v) return null
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : d
  })

/** Fields accepted from the admin COA form (file handled separately). */
export const coaInputSchema = z.object({
  compoundName: z.string().trim().min(1, 'Compound name is required').max(200),
  doseLabel: optionalString,
  casNumber: optionalString,
  appearance: optionalString,
  batchNumber: optionalString,
  taskNumber: optionalString,
  reportCode: optionalString,
  issuingLab: optionalString,
  signedBy: optionalString,
  manufacturer: optionalString,
  testingLab: optionalString,
  clientOfRecord: optionalString,
  distributor: optionalString,
  orderedOn: optionalDate,
  receivedOn: optionalDate,
  analyzedOn: optionalDate,
  purityPercent: optionalNumber,
  puritySpecMin: optionalNumber,
  purityRejectMax: optionalNumber,
  assayMeasuredMg: optionalNumber,
  assayLabelClaimMg: optionalNumber,
  identitySpec: optionalString,
  identityResult: optionalString,
  notes: optionalString,
  published: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => (typeof v === 'string' ? v === 'true' : v ?? true)),
})

export type CoaInput = z.infer<typeof coaInputSchema>

// -------------------------------------------------
// Data access helpers
// -------------------------------------------------

/**
 * Published COAs for a variant identified by SKU, newest first. Used by the
 * storefront. `fileUrlFor` builds the proxy URL for each COA's source document.
 */
export async function getPublishedCoasBySku(
  sku: string,
  fileUrlFor: (coaId: string) => string
): Promise<CoaData[]> {
  if (!prisma || !sku) return []
  try {
    const rows = await prisma.productCoa.findMany({
      where: { published: true, variant: { sku } },
      select: coaScalarSelect,
      orderBy: [{ analyzedOn: 'desc' }, { createdAt: 'desc' }],
    })
    return (rows as unknown as CoaRow[]).map((r) =>
      toCoaData(r, r.fileUrl || r.fileName ? fileUrlFor(r.id) : null)
    )
  } catch (error) {
    logger.warn('Error loading COAs by SKU', { sku, error: String(error) })
    return []
  }
}

/** Whether a variant (by SKU) has any published COA — cheap existence check. */
export async function hasPublishedCoa(sku: string): Promise<boolean> {
  if (!prisma || !sku) return false
  try {
    const count = await prisma.productCoa.count({
      where: { published: true, variant: { sku } },
    })
    return count > 0
  } catch {
    return false
  }
}
