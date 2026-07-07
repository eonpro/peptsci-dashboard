import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { parseProductCsv, type ProductImportRow, type RowError } from '@/lib/product-import'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  csv: z.string().min(1, 'csv is required'),
  validateOnly: z.boolean().optional(),
})

interface ImportSummary {
  totalRows: number
  created: number
  updated: number
  failed: number
  validateOnly: boolean
  errors: RowError[]
}

/**
 * POST /api/admin/products/import
 *
 * Bulk-import products + manufacturer purchasing terms from CSV text.
 * Body: { csv: string, validateOnly?: boolean }
 *
 * Upsert strategy:
 *  - Product matched by name (case-insensitive); created if absent.
 *  - ProductVariant matched by its unique SKU; updated if present, else created.
 *
 * `validateOnly` parses + validates and reports the summary WITHOUT writing,
 * so the UI can preview safely. Admin only.
 */
export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')

    if (!prisma) {
      return errorResponse('Database is not configured', 503, 'DB_UNAVAILABLE')
    }

    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }

    const { csv, validateOnly = false } = parsed.data
    const { rows, errors } = parseProductCsv(csv)

    const summary: ImportSummary = {
      totalRows: rows.length + errors.length,
      created: 0,
      updated: 0,
      failed: errors.length,
      validateOnly,
      errors: [...errors],
    }

    // A structural error (e.g. missing required columns) means we can't import.
    const hasStructuralError = errors.some((e) => e.rowNumber === 1 && rows.length === 0)
    if (hasStructuralError) {
      return errorResponse(errors[0]?.message || 'Invalid CSV', 400, 'VALIDATION_ERROR')
    }

    if (validateOnly) {
      return successResponse(summary)
    }

    // Cache Product ids by lower-cased name to avoid duplicate product rows
    // when many variants share a product name within one file.
    const productIdByName = new Map<string, string>()

    // Product-level fields sourced from the CSV. Only keys present in the row
    // are written, so re-imports never blank out existing values.
    const productDataFromRow = (row: ProductImportRow) => {
      const data: Record<string, string | number> = {}
      if (row.category) data.category = row.category
      if (row.description) data.description = row.description
      if (row.casNumber) data.casNumber = row.casNumber
      if (row.molecularFormula) data.molecularFormula = row.molecularFormula
      if (row.molecularWeight !== undefined) data.molecularWeight = row.molecularWeight
      if (row.pubchemCid) data.pubchemCid = row.pubchemCid
      if (row.peptideLength !== undefined) data.peptideLength = row.peptideLength
      if (row.aka) data.aka = row.aka
      if (row.monoisotopicMass !== undefined) data.monoisotopicMass = row.monoisotopicMass
      if (row.complexity !== undefined) data.complexity = row.complexity
      if (row.xlogp !== undefined) data.xlogp = row.xlogp
      if (row.hydrogenBondDonorCount !== undefined)
        data.hydrogenBondDonorCount = row.hydrogenBondDonorCount
      if (row.hydrogenBondAcceptorCount !== undefined)
        data.hydrogenBondAcceptorCount = row.hydrogenBondAcceptorCount
      if (row.rotatableBondCount !== undefined) data.rotatableBondCount = row.rotatableBondCount
      if (row.heavyAtomCount !== undefined) data.heavyAtomCount = row.heavyAtomCount
      if (row.intendedUse) data.intendedUse = row.intendedUse
      if (row.safetySummary) data.safetySummary = row.safetySummary
      return data
    }

    for (const row of rows) {
      try {
        const nameKey = row.name.toLowerCase()
        let productId = productIdByName.get(nameKey)

        if (!productId) {
          const productData = productDataFromRow(row)
          const existing = await prisma.product.findFirst({
            where: { name: { equals: row.name, mode: 'insensitive' } },
            select: { id: true },
          })
          if (existing) {
            productId = existing.id
            if (Object.keys(productData).length > 0) {
              await prisma.product.update({
                where: { id: existing.id },
                data: productData,
              })
            }
          } else {
            const created = await prisma.product.create({
              data: { name: row.name, ...productData },
              select: { id: true },
            })
            productId = created.id
          }
          productIdByName.set(nameKey, productId)
        }

        const existingVariant = await prisma.productVariant.findUnique({
          where: { sku: row.sku },
          select: { id: true },
        })

        const variantData = {
          productId,
          sku: row.sku,
          dose: row.dose ?? null,
          unitCost: row.unitCost,
          srp: row.srp,
          supplierName: row.supplierName ?? null,
          supplierSku: row.supplierSku ?? null,
          ...(row.inventoryOnHand !== undefined
            ? { inventoryOnHand: Math.trunc(row.inventoryOnHand) }
            : {}),
          ...(row.reorderLevel !== undefined
            ? { reorderLevel: Math.trunc(row.reorderLevel) }
            : {}),
        }

        if (existingVariant) {
          await prisma.productVariant.update({
            where: { id: existingVariant.id },
            data: variantData,
          })
          summary.updated++
        } else {
          await prisma.productVariant.create({ data: variantData })
          summary.created++
        }
      } catch (rowErr) {
        summary.failed++
        summary.errors.push({
          rowNumber: row.rowNumber,
          message: rowErr instanceof Error ? rowErr.message : 'Failed to import row',
        })
      }
    }

    logger.info('Product CSV import completed', {
      by: userId,
      created: summary.created,
      updated: summary.updated,
      failed: summary.failed,
    })

    return successResponse(summary)
  } catch (error) {
    logger.error(
      'Error importing products',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to import products')
  }
}
