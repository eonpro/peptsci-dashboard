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
import { parseSalesCsv, type RowError } from '@/lib/sales-import'
import { buildCostLookup, estimateUnitCost } from '@/lib/sales'
import { coerceDate } from '@/lib/csv-coerce'

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
 * POST /api/admin/sales/import
 *
 * Bulk-import historical sales rows from CSV text into SalesRecord.
 * Body: { csv: string, validateOnly?: boolean }
 *
 * Dedup: rows carrying an `orderId` upsert by `externalId` (re-import safe);
 * rows without one are inserted. COGS is taken from the CSV when present, else
 * computed from unitCost*vials, else estimated from the catalog (35% fallback).
 * Admin only.
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
    const { rows, errors } = parseSalesCsv(csv)

    const summary: ImportSummary = {
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

    const costLookup = await buildCostLookup()

    for (const row of rows) {
      try {
        const product = row.product ?? ''
        const vials = row.vials
        const amountPerVial = row.amountPerVial || (vials > 0 ? row.paidAmount / vials : 0)

        let cogs = row.cogs
        if (cogs === undefined) {
          const unit =
            row.unitCost !== undefined
              ? row.unitCost
              : estimateUnitCost(product, amountPerVial, costLookup)
          cogs = unit * vials
        }
        const unitCost = row.unitCost ?? (vials > 0 ? cogs / vials : 0)

        const data = {
          date: coerceDate(row.date),
          orderRef: row.orderId ?? '',
          customerName: row.customerName ?? '',
          customerEmail: row.customerEmail ?? '',
          customerPhone: row.customerPhone ?? '',
          address: row.address ?? '',
          city: row.city ?? '',
          state: row.state ?? '',
          zip: row.zip ?? '',
          trackingNumber: row.trackingNumber ?? '',
          invoicePaid: row.invoicePaid ?? row.paidAmount > 0,
          paidAmount: row.paidAmount,
          vials,
          amountPerVial,
          product,
          notes: row.notes ?? '',
          unitCost,
          cogs,
          source: 'csv',
        }

        if (row.orderId) {
          await prisma.salesRecord.upsert({
            where: { externalId: row.orderId },
            create: { externalId: row.orderId, ...data },
            update: data,
          })
          summary.updated++
        } else {
          await prisma.salesRecord.create({ data })
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

    logger.info('Sales CSV import completed', {
      by: userId,
      created: summary.created,
      updated: summary.updated,
      failed: summary.failed,
    })

    return successResponse(summary)
  } catch (error) {
    logger.error(
      'Error importing sales',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to import sales')
  }
}
