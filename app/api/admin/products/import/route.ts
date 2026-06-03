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
import { parseProductCsv, type RowError } from '@/lib/product-import'

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

    for (const row of rows) {
      try {
        const nameKey = row.name.toLowerCase()
        let productId = productIdByName.get(nameKey)

        if (!productId) {
          const existing = await prisma.product.findFirst({
            where: { name: { equals: row.name, mode: 'insensitive' } },
            select: { id: true },
          })
          if (existing) {
            productId = existing.id
            if (row.category) {
              await prisma.product.update({
                where: { id: existing.id },
                data: { category: row.category },
              })
            }
          } else {
            const created = await prisma.product.create({
              data: { name: row.name, category: row.category ?? null },
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
