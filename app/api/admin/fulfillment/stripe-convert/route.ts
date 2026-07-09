import { NextRequest } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { addressSchema } from '@/lib/address'
import { createManualOrder } from '@/lib/orders/create'
import { resolveOrderCreatorId, NoOrderActorError } from '@/lib/orders/actor'
import { ManualOrderError } from '@/lib/orders/order-core'
import { reserveForOrder } from '@/lib/inventory/reservations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  salesRecordId: z.string().trim().min(1),
  clientId: z.string().trim().min(1, 'A client is required'),
  patientId: z.string().trim().min(1).optional(),
  lines: z
    .array(
      z.object({
        variantId: z.string().trim().min(1),
        quantity: z.number().int().positive(),
        unitPrice: z.number().min(0).optional(),
      })
    )
    .min(1, 'Map at least one product'),
  shipTo: z.enum(['PRACTICE', 'PATIENT']).optional(),
  shipSpeed: z.enum(['TWO_DAY', 'OVERNIGHT']).optional(),
  shippingAddress: addressSchema.optional(),
  notes: z.string().trim().max(2000).optional(),
})

/**
 * POST /api/admin/fulfillment/stripe-convert
 *
 * Convert an already-paid external Stripe sale (SalesRecord source `stripe`)
 * into a fulfillable order. The money was captured on Stripe, so the order is
 * created CAPTURED and linked by stripePaymentIntentId; stock is reserved. The
 * originating SalesRecord is linked to the new order (orderId) so analytics is
 * NOT double-counted — the real Stripe revenue/COGS on that row are preserved.
 * Admin only.
 */
export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }
    const input = parsed.data

    const record = await prisma.salesRecord.findUnique({
      where: { id: input.salesRecordId },
      select: { id: true, source: true, orderId: true, stripePaymentIntentId: true, date: true },
    })
    if (!record) return errorResponse('Sales record not found', 404, 'NOT_FOUND')
    if (record.orderId) return errorResponse('This payment has already been converted', 409, 'ALREADY_CONVERTED')
    if (record.source !== 'stripe') {
      return errorResponse('Only external Stripe payments can be converted', 400, 'NOT_STRIPE_SOURCE')
    }

    // Guard against double-conversion of the same PaymentIntent (Order.stripePaymentIntentId is unique).
    if (record.stripePaymentIntentId) {
      const existing = await prisma.order.findFirst({
        where: { stripePaymentIntentId: record.stripePaymentIntentId },
        select: { id: true },
      })
      if (existing) return errorResponse('An order already exists for this payment', 409, 'ORDER_EXISTS')
    }

    const createdById = await resolveOrderCreatorId(userId)

    const order = await createManualOrder({
      clientId: input.clientId,
      patientId: input.patientId ?? null,
      lines: input.lines,
      shipTo: input.shipTo,
      shipSpeed: input.shipSpeed,
      shippingAddress: input.shippingAddress
        ? (input.shippingAddress as unknown as Prisma.InputJsonValue)
        : null,
      notes: input.notes ?? null,
      createdById,
      source: 'STRIPE_INVOICE',
      status: 'SUBMITTED',
      paymentStatus: 'CAPTURED',
      stripePaymentIntentId: record.stripePaymentIntentId ?? null,
      paidAt: record.date ?? new Date(),
    })

    // Link the originating SalesRecord to the new order so it is not double
    // counted (kept as source `stripe` to preserve the true captured revenue/COGS).
    await prisma.salesRecord.update({
      where: { id: record.id },
      data: { orderId: order.id, trackingNumber: '' },
    })

    // Payment was captured externally, so reconcile never runs — reserve here.
    await reserveForOrder(order.id).catch((e) =>
      logger.warn('[stripe-convert] reserveForOrder failed (non-blocking)', {
        orderId: order.id,
        error: e instanceof Error ? e.message : String(e),
      })
    )

    logger.info('[stripe-convert] converted Stripe sale to order', {
      salesRecordId: record.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
    })

    return successResponse({ order }, 201)
  } catch (error) {
    if (error instanceof ManualOrderError) return errorResponse(error.message, 400, error.code)
    if (error instanceof NoOrderActorError) return errorResponse(error.message, 409, error.code)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return errorResponse('An order already exists for this payment', 409, 'ORDER_EXISTS')
    }
    logger.error('[stripe-convert] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to convert Stripe payment')
  }
}
