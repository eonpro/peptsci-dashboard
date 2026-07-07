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
import { validateManualSale } from '@/lib/manual-sale'
import { buildCostLookup, estimateUnitCost } from '@/lib/sales'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  customerName: z.string().optional(),
  customerEmail: z.string().optional(),
  customerPhone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  date: z.string().optional(),
  orderRef: z.string().optional(),
  product: z.string().optional(),
  vials: z.number().optional(),
  amountPerVial: z.number().optional(),
  paidAmount: z.number().optional(),
  invoicePaid: z.boolean().optional(),
  trackingNumber: z.string().optional(),
  notes: z.string().optional(),
  unitCost: z.number().optional(),
})

/**
 * POST /api/admin/sales
 *
 * Create a single SalesRecord from the "Add Customer / Record Sale" dialog.
 * Sale figures are optional — a record with only customer contact info is a
 * valid $0 entry that makes the customer appear on the Customers page. COGS
 * mirrors the CSV importer: explicit unitCost wins, else estimated from the
 * catalog (35% fallback). Admin only.
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

    const result = validateManualSale(parsed.data)
    if (!result.ok) {
      return errorResponse(result.errors.join('; '), 400, 'VALIDATION_ERROR')
    }
    const v = result.value

    let unitCost = v.unitCost ?? 0
    let cogs = 0
    if (v.vials > 0) {
      if (v.unitCost === undefined && v.product) {
        const costLookup = await buildCostLookup()
        unitCost = estimateUnitCost(v.product, v.amountPerVial, costLookup)
      }
      cogs = unitCost * v.vials
    }

    const record = await prisma.salesRecord.create({
      data: {
        date: v.date,
        orderRef: v.orderRef,
        customerName: v.customerName,
        customerEmail: v.customerEmail,
        customerPhone: v.customerPhone,
        address: v.address,
        city: v.city,
        state: v.state,
        zip: v.zip,
        trackingNumber: v.trackingNumber,
        invoicePaid: v.invoicePaid,
        paidAmount: v.paidAmount,
        vials: v.vials,
        amountPerVial: v.amountPerVial,
        product: v.product,
        notes: v.notes,
        unitCost,
        cogs,
        source: 'manual',
      },
      select: { id: true },
    })

    logger.info('Manual sales record created', {
      id: record.id,
      by: userId,
      customer: v.customerName || v.customerEmail || v.customerPhone,
      paidAmount: v.paidAmount,
    })

    return successResponse({ id: record.id }, 201)
  } catch (error) {
    logger.error(
      'Error creating manual sales record',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to create sales record')
  }
}
