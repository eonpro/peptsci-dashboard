import { NextRequest } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { requireAdmin, unauthorizedResponse, forbiddenResponse, errorResponse, successResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { addressSchema } from '@/lib/address'
import { createManualOrder } from '@/lib/orders/create'
import { resolveOrderCreatorId, NoOrderActorError } from '@/lib/orders/actor'
import { ManualOrderError } from '@/lib/orders/order-core'

export const dynamic = 'force-dynamic'

const querySchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  shipped: z.enum(['true', 'false', 'all']).optional().default('all'),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
})

/** GET /api/admin/orders — orders for the fulfillment surface. Admin only. */
export async function GET(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const params = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams))

    const where: Record<string, unknown> = { status: { not: 'DRAFT' } }
    // "Shipped" means a label/tracking exists OR the order was manually
    // dispositioned (shippingStatus set without tracking, e.g. hand delivery).
    // Wrapped in AND so it can't collide with the search OR below.
    if (params.shipped === 'true') {
      where.AND = [{ OR: [{ trackingNumber: { not: null } }, { shippingStatus: { not: null } }] }]
    } else if (params.shipped === 'false') {
      where.trackingNumber = null
      where.shippingStatus = null
    }
    if (params.status && params.status !== 'all') where.status = params.status
    if (params.search) {
      const asNum = Number(params.search.replace(/^#/, ''))
      where.OR = [
        ...(Number.isInteger(asNum) ? [{ orderNumber: asNum }] : []),
        { trackingNumber: { contains: params.search, mode: 'insensitive' } },
        { client: { organizationName: { contains: params.search, mode: 'insensitive' } } },
      ]
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          shippingStatus: true,
          carrier: true,
          trackingNumber: true,
          trackingUrl: true,
          total: true,
          createdAt: true,
          shippedAt: true,
          shippingAddress: true,
          client: { select: { id: true, organizationName: true, contactName: true, contactPhone: true } },
          items: {
            select: {
              quantity: true,
              variant: { select: { dose: true, product: { select: { name: true } } } },
            },
          },
          fulfillment: { select: { stage: true } },
          _count: { select: { packagePhotos: true, shipmentLabels: true } },
        },
      }),
      prisma.order.count({ where }),
    ])

    const data = orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      paymentStatus: o.paymentStatus,
      shippingStatus: o.shippingStatus,
      carrier: o.carrier,
      trackingNumber: o.trackingNumber,
      trackingUrl: o.trackingUrl,
      total: Number(o.total),
      createdAt: o.createdAt.toISOString(),
      shippedAt: o.shippedAt?.toISOString() ?? null,
      shippingAddress: o.shippingAddress,
      client: o.client,
      items: o.items.map((it) => ({
        name: it.variant.product.name,
        dose: it.variant.dose,
        quantity: it.quantity,
      })),
      fulfillmentStage: o.fulfillment?.stage ?? 'NOT_STARTED',
      photoCount: o._count.packagePhotos,
      labelCount: o._count.shipmentLabels,
    }))

    return successResponse({
      orders: data,
      meta: { total, page: params.page, limit: params.limit, totalPages: Math.ceil(total / params.limit) },
    })
  } catch (error) {
    logger.error('[admin/orders] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to load orders')
  }
}

const createOrderSchema = z.object({
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
    .min(1, 'Add at least one product'),
  shipTo: z.enum(['PRACTICE', 'PATIENT']).optional(),
  shipSpeed: z.enum(['TWO_DAY', 'OVERNIGHT']).optional(),
  shippingAddress: addressSchema.optional(),
  notes: z.string().trim().max(2000).optional(),
  internalNotes: z.string().trim().max(2000).optional(),
  status: z.enum(['DRAFT', 'SUBMITTED']).optional(),
})

/**
 * POST /api/admin/orders — create a manual order from the Fulfillment "New
 * Order" builder. Prices server-side (Model A); payment is taken separately via
 * POST /api/admin/orders/[id]/charge. Admin only.
 */
export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const parsed = createOrderSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }
    const input = parsed.data

    const createdById = await resolveOrderCreatorId(userId)

    const result = await createManualOrder({
      clientId: input.clientId,
      patientId: input.patientId ?? null,
      lines: input.lines,
      shipTo: input.shipTo,
      shipSpeed: input.shipSpeed,
      shippingAddress: input.shippingAddress
        ? (input.shippingAddress as unknown as Prisma.InputJsonValue)
        : null,
      notes: input.notes ?? null,
      internalNotes: input.internalNotes ?? null,
      createdById,
      status: input.status ?? 'SUBMITTED',
    })

    return successResponse({ order: result }, 201)
  } catch (error) {
    if (error instanceof ManualOrderError) {
      return errorResponse(error.message, 400, error.code)
    }
    if (error instanceof NoOrderActorError) {
      return errorResponse(error.message, 409, error.code)
    }
    logger.error('[admin/orders] create error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to create order')
  }
}
