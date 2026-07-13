import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, getRateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveShopActor } from '@/lib/shop-actor'
import { createReturnRequest } from '@/lib/returns/service'

export const dynamic = 'force-dynamic'

/** Order states from which a client may open a return (goods have shipped). */
const RETURNABLE_ORDER_STATUSES = new Set(['FULFILLED', 'SHIPPED', 'COMPLETED'])

const REASONS = [
  'damaged_in_transit',
  'wrong_item',
  'quality_issue',
  'ordered_by_mistake',
  'other',
] as const

const bodySchema = z.object({
  reason: z.enum(REASONS),
  notes: z.string().trim().max(1000).optional(),
  items: z
    .array(
      z.object({
        orderItemId: z.string().min(1),
        quantity: z.number().int().min(1).max(999),
      })
    )
    .min(1),
})

/** GET — return requests already opened for this order (owner only). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) return unauthorizedResponse()
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const actor = await resolveShopActor(userId)
    if (!actor) return errorResponse('No client account linked', 403, 'NO_CLIENT')

    const { id } = await params
    const order = await prisma.order.findFirst({
      where: { id, clientId: actor.clientId },
      select: { id: true, status: true },
    })
    if (!order) return errorResponse('Order not found', 404, 'NOT_FOUND')

    const returns = await prisma.returnRequest.findMany({
      where: { orderId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        rmaNumber: true,
        status: true,
        reason: true,
        createdAt: true,
        items: { select: { productName: true, quantity: true } },
      },
    })

    return successResponse({
      returns,
      canRequest: RETURNABLE_ORDER_STATUSES.has(order.status),
      reasons: REASONS,
    })
  } catch (error) {
    logger.error('[shop/orders/:id/returns] GET error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to load returns')
  }
}

/**
 * POST — client opens a return (RMA) for their own shipped order. Quantities
 * are capped at (ordered − already requested in non-rejected returns) per
 * line. Reuses the same createReturnRequest service as the admin flow, which
 * also notifies admins.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) return unauthorizedResponse()

    const rl = await checkRateLimit(getRateLimitKey(request, userId), RATE_LIMITS.auth)
    if (rl.limited) {
      return NextResponse.json(
        { error: 'Too Many Requests', message: 'Rate limit exceeded', code: 'RATE_LIMITED' },
        { status: 429, headers: getRateLimitHeaders(rl.remaining, RATE_LIMITS.auth, rl.retryAfter) }
      )
    }
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const actor = await resolveShopActor(userId)
    if (!actor) return errorResponse('No client account linked', 403, 'NO_CLIENT')

    const { id } = await params
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }

    const order = await prisma.order.findFirst({
      where: { id, clientId: actor.clientId },
      select: {
        id: true,
        status: true,
        items: {
          select: {
            id: true,
            quantity: true,
            variantId: true,
            variant: { select: { product: { select: { name: true } }, dose: true } },
          },
        },
      },
    })
    if (!order) return errorResponse('Order not found', 404, 'NOT_FOUND')
    if (!RETURNABLE_ORDER_STATUSES.has(order.status)) {
      return errorResponse(
        'Returns can be requested once the order has shipped.',
        409,
        'NOT_RETURNABLE'
      )
    }

    // Per-line cap: ordered − already requested (excluding rejected returns).
    const priorItems = await prisma.returnItem.groupBy({
      by: ['orderItemId'],
      where: {
        returnRequest: { orderId: id, status: { not: 'REJECTED' } },
        orderItemId: { not: null },
      },
      _sum: { quantity: true },
    })
    const alreadyRequested = new Map(
      priorItems.map((p) => [p.orderItemId as string, p._sum.quantity ?? 0])
    )
    const byId = new Map(order.items.map((it) => [it.id, it]))

    const items = []
    for (const line of parsed.data.items) {
      const orderItem = byId.get(line.orderItemId)
      if (!orderItem) {
        return errorResponse('Item does not belong to this order', 400, 'ITEM_MISMATCH')
      }
      const remaining = orderItem.quantity - (alreadyRequested.get(orderItem.id) ?? 0)
      if (line.quantity > remaining) {
        return errorResponse(
          `Return quantity for ${orderItem.variant.product.name} exceeds the returnable amount (${Math.max(0, remaining)}).`,
          400,
          'QTY_EXCEEDS_ORDERED'
        )
      }
      items.push({
        orderItemId: orderItem.id,
        variantId: orderItem.variantId,
        productName: [orderItem.variant.product.name, orderItem.variant.dose]
          .filter(Boolean)
          .join(' '),
        quantity: line.quantity,
      })
    }

    const created = await createReturnRequest({
      orderId: order.id,
      reason: parsed.data.reason,
      notes: parsed.data.notes || null,
      requestedById: actor.userId,
      items,
    })

    return successResponse({
      id: created.id,
      rmaNumber: created.rmaNumber,
      status: created.status,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create return'
    logger.error('[shop/orders/:id/returns] POST error', { message }, error as Error)
    return errorResponse(message)
  }
}
