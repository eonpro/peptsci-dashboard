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
import { parseSupplierPriceCsv, type RowError } from '@/lib/supplier-import'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Row-by-row upserts (idempotent by (supplierId, supplierSku)); allow big lists.
export const maxDuration = 300

const bodySchema = z.object({
  supplierName: z.string().trim().min(1, 'supplierName is required'),
  csv: z.string().min(1, 'csv is required'),
  validateOnly: z.boolean().optional(),
})

interface ImportSummary {
  supplierName: string
  totalRows: number
  created: number
  updated: number
  failed: number
  validateOnly: boolean
  errors: RowError[]
}

/**
 * POST /api/admin/suppliers/import
 *
 * Import (or refresh) a supplier's price list from CSV text. The supplier is
 * upserted by name; items are upserted by (supplier, supplierSku) so
 * re-importing an updated sheet revises prices in place. Accepts manufacturer
 * sheets as-is (e.g. "Cat.No, Name, Specification, Vials Per Box, ... -10%")
 * — discounted columns are used as our cost. Admin only.
 */
export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')

    if (!prisma) return errorResponse('Database is not configured', 503, 'DB_UNAVAILABLE')

    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }

    const { supplierName, csv, validateOnly = false } = parsed.data
    const { rows, errors } = parseSupplierPriceCsv(csv)

    const summary: ImportSummary = {
      supplierName,
      totalRows: rows.length + errors.length,
      created: 0,
      updated: 0,
      failed: errors.length,
      validateOnly,
      errors: [...errors],
    }

    const hasStructuralError = errors.some((e) => e.rowNumber === 1 && rows.length === 0)
    if (hasStructuralError) {
      return errorResponse(errors[0]?.message || 'Invalid CSV', 400, 'VALIDATION_ERROR')
    }

    if (validateOnly) {
      return successResponse(summary)
    }

    const supplier = await prisma.supplier.upsert({
      where: { name: supplierName },
      update: {},
      create: { name: supplierName },
      select: { id: true },
    })

    for (const row of rows) {
      try {
        const existing = await prisma.supplierPriceItem.findUnique({
          where: {
            supplierId_supplierSku: { supplierId: supplier.id, supplierSku: row.supplierSku },
          },
          select: { id: true },
        })
        const data = {
          productName: row.productName,
          dose: row.dose ?? '',
          vialsPerBox: row.vialsPerBox ?? null,
          unitCost: row.unitCost,
          listPrice: row.listPrice ?? null,
        }
        if (existing) {
          await prisma.supplierPriceItem.update({ where: { id: existing.id }, data })
          summary.updated++
        } else {
          await prisma.supplierPriceItem.create({
            data: { supplierId: supplier.id, supplierSku: row.supplierSku, ...data },
          })
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

    logger.info('Supplier price list import completed', {
      by: userId,
      supplier: supplierName,
      created: summary.created,
      updated: summary.updated,
      failed: summary.failed,
    })

    return successResponse(summary)
  } catch (error) {
    logger.error(
      'Error importing supplier price list',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to import supplier price list')
  }
}
