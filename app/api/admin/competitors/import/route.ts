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
import { parseCompetitorCsv, type RowError } from '@/lib/competitor-import'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Large CSVs are processed row-by-row (each row idempotent via upsert-by-key,
// no giant transaction), so allow up to 5 minutes.
export const maxDuration = 300

const bodySchema = z.object({
  csv: z.string().min(1, 'csv is required'),
  validateOnly: z.boolean().optional(),
})

interface ImportSummary {
  totalRows: number
  /** Rows actually attempted against the DB (progress even on partial runs). */
  processed: number
  created: number
  updated: number
  failed: number
  validateOnly: boolean
  errors: RowError[]
}

/**
 * POST /api/admin/competitors/import
 *
 * Bulk-import competitor prices into CompetitorPrice. Upserts by the unique
 * (competitorName, productName, dose) tuple so re-imports update in place.
 * `diff` is computed as ourSrp - theirPrice when omitted. Admin only.
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

    const { csv, validateOnly = false } = parsed.data
    const { rows, errors } = parseCompetitorCsv(csv)

    const summary: ImportSummary = {
      totalRows: rows.length + errors.length,
      processed: 0,
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

    if (validateOnly) return successResponse(summary)

    for (const row of rows) {
      summary.processed++
      try {
        const diff = row.diff ?? row.ourSrp - row.theirPrice
        const data = {
          theirPrice: row.theirPrice,
          ourSrp: row.ourSrp,
          diff,
        }
        const existing = await prisma.competitorPrice.findUnique({
          where: {
            competitorName_productName_dose: {
              competitorName: row.competitor,
              productName: row.product,
              dose: row.dose ?? '',
            },
          },
          select: { id: true },
        })
        if (existing) {
          await prisma.competitorPrice.update({ where: { id: existing.id }, data })
          summary.updated++
        } else {
          await prisma.competitorPrice.create({
            data: {
              competitorName: row.competitor,
              productName: row.product,
              dose: row.dose ?? '',
              ...data,
            },
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

    logger.info('Competitor CSV import completed', {
      by: userId,
      created: summary.created,
      updated: summary.updated,
      failed: summary.failed,
    })

    return successResponse(summary)
  } catch (error) {
    logger.error(
      'Error importing competitors',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to import competitors')
  }
}
