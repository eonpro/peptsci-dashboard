import { NextRequest } from 'next/server'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/clients
 * List clients (organizations) for admin tooling (e.g. client pricing). Admin only.
 */
export async function GET(_request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')

    if (!prisma) {
      return successResponse({ clients: [] })
    }

    const clients = await prisma.client.findMany({
      orderBy: { organizationName: 'asc' },
      select: {
        id: true,
        organizationName: true,
        npiNumber: true,
        providerName: true,
        contactName: true,
        contactEmail: true,
        contactPhone: true,
        onboardingStatus: true,
        createdAt: true,
        _count: { select: { customPricing: true, orders: true } },
      },
    })

    return successResponse({
      clients: clients.map((c) => ({
        id: c.id,
        organizationName: c.organizationName,
        npiNumber: c.npiNumber,
        providerName: c.providerName,
        contactName: c.contactName,
        contactEmail: c.contactEmail,
        contactPhone: c.contactPhone,
        onboardingStatus: c.onboardingStatus,
        createdAt: c.createdAt,
        customPriceCount: c._count.customPricing,
        orderCount: c._count.orders,
      })),
    })
  } catch (error) {
    logger.error(
      'Error listing clients',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to list clients')
  }
}
