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
import {
  parseDistributorOrderCsv,
  groupDistributorOrders,
  type RowError,
} from '@/lib/distributor-order-import'
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
 * POST /api/admin/distributor-orders/import
 *
 * Bulk-import distributor purchase orders + line items from a flat CSV
 * (one row per line, grouped by orderId). Orders upsert by `externalId`; their
 * line items are replaced on each import so re-uploads are clean. Admin only.
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
    const { rows, errors } = parseDistributorOrderCsv(csv)

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

    if (validateOnly) return successResponse(summary)

    const orders = groupDistributorOrders(rows)
    const db = prisma

    for (const order of orders) {
      try {
        await db.$transaction(async (tx) => {
          const existing = await tx.distributorOrder.findUnique({
            where: { externalId: order.externalId },
            select: { id: true },
          })

          const header = {
            orderDate: coerceDate(order.orderDate),
            vendor: order.vendor,
            subtotal: order.subtotal,
            shipping: order.shipping,
            paypalFee: order.paypalFee,
            total: order.total,
            status: order.status,
            trackingNumber: order.trackingNumber ?? null,
          }

          if (existing) {
            await tx.distributorOrder.update({ where: { id: existing.id }, data: header })
            await tx.distributorOrderLine.deleteMany({ where: { orderId: existing.id } })
            await tx.distributorOrderLine.createMany({
              data: order.lines.map((l) => ({ orderId: existing.id, ...l })),
            })
            summary.updated++
          } else {
            const created = await tx.distributorOrder.create({
              data: { externalId: order.externalId, ...header },
              select: { id: true },
            })
            await tx.distributorOrderLine.createMany({
              data: order.lines.map((l) => ({ orderId: created.id, ...l })),
            })
            summary.created++
          }
        })
      } catch (orderErr) {
        summary.failed++
        summary.errors.push({
          rowNumber: rows.find((r) => r.orderId === order.externalId)?.rowNumber ?? 1,
          message: `Order ${order.externalId}: ${orderErr instanceof Error ? orderErr.message : 'failed to import'}`,
        })
      }
    }

    logger.info('Distributor order CSV import completed', {
      by: userId,
      created: summary.created,
      updated: summary.updated,
      failed: summary.failed,
    })

    return successResponse(summary)
  } catch (error) {
    logger.error(
      'Error importing distributor orders',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to import distributor orders')
  }
}
