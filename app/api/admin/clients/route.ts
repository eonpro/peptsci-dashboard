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
import { npiSchema } from '@/lib/profile'

export const dynamic = 'force-dynamic'

const createClientSchema = z.object({
  organizationName: z.string().trim().min(2, 'Practice name is required').max(200),
  providerName: z.string().trim().min(2).max(200).optional(),
  npiNumber: npiSchema.optional(),
  contactName: z.string().trim().min(2).max(120).optional(),
  contactEmail: z.string().trim().email('Enter a valid email').max(200).optional(),
  contactPhone: z.string().trim().min(7).max(30).optional(),
  billingAddress: addressSchema.optional(),
  shippingAddress: addressSchema.optional(),
  onboardingStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'NEEDS_INFO']).default('APPROVED'),
})

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

/**
 * POST /api/admin/clients
 * Create a new client (practice / organization). Admin only. NPI is optional
 * for admin-created accounts and defaults to APPROVED so the practice is
 * immediately usable; pass onboardingStatus to override.
 */
export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const parsed = createClientSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }
    const input = parsed.data

    try {
      const client = await prisma.client.create({
        data: {
          organizationName: input.organizationName,
          providerName: input.providerName ?? null,
          npiNumber: input.npiNumber ?? null,
          contactName: input.contactName ?? null,
          contactEmail: input.contactEmail ?? null,
          contactPhone: input.contactPhone ?? null,
          billingAddress: input.billingAddress
            ? (input.billingAddress as unknown as Prisma.InputJsonValue)
            : undefined,
          shippingAddress: input.shippingAddress
            ? (input.shippingAddress as unknown as Prisma.InputJsonValue)
            : undefined,
          onboardingStatus: input.onboardingStatus,
        },
        select: { id: true, organizationName: true, onboardingStatus: true },
      })

      logger.info('[ADMIN CLIENTS] created', { clientId: client.id })
      return successResponse({ client }, 201)
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return errorResponse(
          'That NPI number is already registered to another account.',
          409,
          'NPI_TAKEN'
        )
      }
      throw err
    }
  } catch (error) {
    logger.error(
      'Error creating client',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to create client')
  }
}
