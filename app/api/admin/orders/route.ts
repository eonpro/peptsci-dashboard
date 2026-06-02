import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin, unauthorizedResponse, forbiddenResponse, errorResponse, successResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

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
    if (params.shipped === 'true') where.trackingNumber = { not: null }
    else if (params.shipped === 'false') where.trackingNumber = null
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
          shippingStatus: true,
          carrier: true,
          trackingNumber: true,
          trackingUrl: true,
          total: true,
          createdAt: true,
          shippedAt: true,
          shippingAddress: true,
          client: { select: { id: true, organizationName: true, contactName: true, contactPhone: true } },
          _count: { select: { packagePhotos: true, shipmentLabels: true } },
        },
      }),
      prisma.order.count({ where }),
    ])

    const data = orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      shippingStatus: o.shippingStatus,
      carrier: o.carrier,
      trackingNumber: o.trackingNumber,
      trackingUrl: o.trackingUrl,
      total: Number(o.total),
      createdAt: o.createdAt.toISOString(),
      shippedAt: o.shippedAt?.toISOString() ?? null,
      shippingAddress: o.shippingAddress,
      client: o.client,
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
