import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  requireSuperAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { writeAudit } from '@/lib/audit'
import { setClientPricing, removeClientPricing } from '@/lib/pricing'
import {
  parseClientPricingCsv,
  type RowError,
} from '@/lib/client-pricing-import'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const bodySchema = z.object({
  clientId: z.string().min(1, 'clientId is required'),
  csv: z.string().min(1, 'csv is required'),
  validateOnly: z.boolean().optional(),
})

interface ImportSummary {
  clientId: string
  totalRows: number
  created: number
  updated: number
  cleared: number
  failed: number
  validateOnly: boolean
  errors: RowError[]
}

/**
 * POST /api/admin/client-pricing/import
 *
 * Bulk-set (or clear) custom prices for one client from CSV.
 * Body: { clientId, csv, validateOnly? }
 * Headers: sku, custom_price, notes (optional). Blank custom_price clears.
 * SUPER_ADMIN only.
 */
export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin, isSuperAdmin, userId } = await requireSuperAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin || !isSuperAdmin) {
      return forbiddenResponse('Super admin access required')
    }

    if (!prisma) return errorResponse('Database is not configured', 503, 'DB_UNAVAILABLE')

    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }

    const { clientId, csv, validateOnly = false } = parsed.data

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, organizationName: true },
    })
    if (!client) {
      return errorResponse('Client not found', 404, 'NOT_FOUND')
    }

    const { rows, errors } = parseClientPricingCsv(csv)

    const summary: ImportSummary = {
      clientId,
      totalRows: rows.length + errors.length,
      created: 0,
      updated: 0,
      cleared: 0,
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

    // Resolve SKUs → variant ids once for the whole file.
    const skus = [...new Set(rows.map((r) => r.sku))]
    const variants = await prisma.productVariant.findMany({
      where: { sku: { in: skus } },
      select: { id: true, sku: true },
    })
    const variantBySku = new Map(
      variants.filter((v) => v.sku).map((v) => [v.sku!.toLowerCase(), v])
    )

    const existing = await prisma.clientPricing.findMany({
      where: { clientId, variantId: { in: variants.map((v) => v.id) } },
      select: { variantId: true, isActive: true },
    })
    const existingByVariant = new Map(existing.map((e) => [e.variantId, e]))

    for (const row of rows) {
      try {
        const variant = variantBySku.get(row.sku.toLowerCase())
        if (!variant) {
          summary.failed++
          summary.errors.push({
            rowNumber: row.rowNumber,
            message: `Unknown SKU "${row.sku}"`,
          })
          continue
        }

        if (row.clear) {
          const result = await removeClientPricing(clientId, variant.id)
          if (!result.success) {
            summary.failed++
            summary.errors.push({
              rowNumber: row.rowNumber,
              message: result.error || 'Failed to clear pricing',
            })
            continue
          }
          summary.cleared++
          continue
        }

        const prev = existingByVariant.get(variant.id)
        const result = await setClientPricing(clientId, variant.id, row.customPrice as number, {
          notes: row.notes,
          createdBy: userId || undefined,
        })
        if (!result.success) {
          summary.failed++
          summary.errors.push({
            rowNumber: row.rowNumber,
            message: result.error || 'Failed to set pricing',
          })
          continue
        }

        if (prev?.isActive) summary.updated++
        else summary.created++
        existingByVariant.set(variant.id, { variantId: variant.id, isActive: true })
      } catch (rowErr) {
        summary.failed++
        summary.errors.push({
          rowNumber: row.rowNumber,
          message: rowErr instanceof Error ? rowErr.message : 'Failed to import row',
        })
      }
    }

    logger.info('Client pricing CSV import', {
      clientId,
      created: summary.created,
      updated: summary.updated,
      cleared: summary.cleared,
      failed: summary.failed,
      by: userId,
    })
    void writeAudit({
      clerkUserId: userId,
      entity: 'ClientPricing',
      entityId: clientId,
      action: 'pricing_csv_import',
      metadata: {
        clientId,
        created: summary.created,
        updated: summary.updated,
        cleared: summary.cleared,
        failed: summary.failed,
      },
    })

    return successResponse(summary)
  } catch (error) {
    logger.error(
      'Client pricing import failed',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to import client pricing')
  }
}
