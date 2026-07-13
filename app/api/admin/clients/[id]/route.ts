import { NextRequest, NextResponse } from 'next/server'
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
import { einSchema, npiSchema, serializeClientProfile } from '@/lib/profile'
import { deleteClientForce } from '@/lib/clients/delete-client'
import { cascadeOnboardingDecision } from '@/lib/clients/approval'

export const dynamic = 'force-dynamic'

const clientSelect = {
  id: true,
  organizationName: true,
  npiNumber: true,
  providerName: true,
  ein: true,
  contactName: true,
  contactEmail: true,
  contactPhone: true,
  billingAddress: true,
  shippingAddress: true,
  onboardingStatus: true,
  paymentTermsDays: true,
  creditLimit: true,
} as const

const adminUpdateSchema = z.object({
  organizationName: z.string().trim().min(2).max(200).optional(),
  providerName: z.string().trim().min(2).max(200).optional(),
  npiNumber: npiSchema.optional(),
  ein: einSchema.optional(),
  contactName: z.string().trim().min(2).max(120).optional(),
  contactEmail: z.string().trim().email().max(200).optional(),
  contactPhone: z.string().trim().min(7).max(30).optional(),
  billingAddress: addressSchema.optional(),
  shippingAddress: addressSchema.optional(),
  onboardingStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'NEEDS_INFO']).optional(),
  // Net-terms billing: null disables "bill to account"; creditLimit null = no cap.
  paymentTermsDays: z.number().int().min(1).max(365).nullable().optional(),
  creditLimit: z.number().min(0).max(10_000_000).nullable().optional(),
})

/** GET /api/admin/clients/[id] — full client profile + linked users. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const client = await prisma.client.findUnique({
      where: { id },
      select: {
        ...clientSelect,
        createdAt: true,
        users: {
          select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true },
        },
        _count: {
          select: {
            orders: true,
            patients: true,
            customPricing: { where: { isActive: true } },
          },
        },
      },
    })
    if (!client) return errorResponse('Client not found', 404, 'NOT_FOUND')

    // Onboarding setup snapshot: what an admin still needs to configure for
    // this practice to be fully operational (pricing / terms / documents).
    const docGroups = await prisma.clientDocument.groupBy({
      by: ['status'],
      where: { clientId: id },
      _count: { _all: true },
    })
    const docCount = (status: string) =>
      docGroups.find((g) => g.status === status)?._count._all ?? 0
    const setup = {
      customPricingCount: client._count.customPricing,
      termsSet: client.paymentTermsDays != null,
      documents: {
        total: docGroups.reduce((sum, g) => sum + g._count._all, 0),
        pendingReview: docCount('PENDING_REVIEW'),
        approved: docCount('APPROVED'),
        rejected: docCount('REJECTED'),
      },
    }

    return successResponse({
      profile: serializeClientProfile(client),
      users: client.users,
      counts: { orders: client._count.orders, patients: client._count.patients },
      setup,
      createdAt: client.createdAt,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load client'
    logger.error('[ADMIN CLIENTS] get error', { message }, error as Error)
    return errorResponse(message)
  }
}

/**
 * PATCH /api/admin/clients/[id] — edit any field (admins). Setting
 * onboardingStatus cascades to the linked users' status + Clerk metadata:
 *   APPROVED → users ACTIVE; REJECTED → users SUSPENDED.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const parsed = adminUpdateSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }
    const input = parsed.data

    const data: Prisma.ClientUpdateInput = {}
    if (input.organizationName !== undefined) data.organizationName = input.organizationName
    if (input.providerName !== undefined) data.providerName = input.providerName
    if (input.npiNumber !== undefined) data.npiNumber = input.npiNumber
    if (input.ein !== undefined) data.ein = input.ein || null
    if (input.contactName !== undefined) data.contactName = input.contactName
    if (input.contactEmail !== undefined) data.contactEmail = input.contactEmail
    if (input.contactPhone !== undefined) data.contactPhone = input.contactPhone
    if (input.billingAddress !== undefined)
      data.billingAddress = input.billingAddress as unknown as Prisma.InputJsonValue
    if (input.shippingAddress !== undefined)
      data.shippingAddress = input.shippingAddress as unknown as Prisma.InputJsonValue
    if (input.paymentTermsDays !== undefined) data.paymentTermsDays = input.paymentTermsDays
    if (input.creditLimit !== undefined) data.creditLimit = input.creditLimit

    let client
    try {
      client = await prisma.client.update({
        where: { id },
        data,
        select: clientSelect,
      })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002')
          return errorResponse('That NPI number is already registered to another account.', 409, 'NPI_TAKEN')
        if (err.code === 'P2025') return errorResponse('Client not found', 404, 'NOT_FOUND')
      }
      throw err
    }

    // Onboarding decisions go through the canonical cascade (client status +
    // linked users' DB/Clerk status + decision emails) shared with the /users
    // approval route, so no path can drift. Resetting to PENDING is a plain
    // status write (no user cascade, no email).
    if (input.onboardingStatus !== undefined) {
      if (input.onboardingStatus === 'PENDING') {
        await prisma.client.update({ where: { id }, data: { onboardingStatus: 'PENDING' } })
      } else {
        await cascadeOnboardingDecision({ clientId: id, decision: input.onboardingStatus })
      }
      client = { ...client, onboardingStatus: input.onboardingStatus }
    }

    return successResponse({ profile: serializeClientProfile(client) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update client'
    logger.error('[ADMIN CLIENTS] patch error', { message }, error as Error)
    return errorResponse(message)
  }
}

/**
 * DELETE /api/admin/clients/[id]
 *
 * Removes a practice account. Without `?force=1`, refuses when the client has
 * orders or invoices (returns 409 with counts) so financial history is not
 * silently destroyed. With `?force=1`, cleans up non-cascading dependents and
 * deletes the client. Linked auth users are unlinked, never deleted. Admin only.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const force = request.nextUrl.searchParams.get('force') === '1'

    const client = await prisma.client.findUnique({
      where: { id },
      select: {
        id: true,
        organizationName: true,
        _count: { select: { orders: true, invoices: true, users: true, customPricing: true } },
      },
    })
    if (!client) return errorResponse('Client not found', 404, 'NOT_FOUND')

    const hasHistory = client._count.orders > 0 || client._count.invoices > 0
    if (hasHistory && !force) {
      return NextResponse.json(
        {
          error: 'Conflict',
          code: 'HAS_HISTORY',
          message: `This client has ${client._count.orders} order(s) and ${client._count.invoices} invoice(s). Confirm force delete to remove them.`,
          orders: client._count.orders,
          invoices: client._count.invoices,
          users: client._count.users,
          customPricing: client._count.customPricing,
        },
        { status: 409 }
      )
    }

    const counts = await deleteClientForce(prisma, id)

    logger.info('[ADMIN CLIENTS] deleted', {
      clientId: id,
      organizationName: client.organizationName,
      force,
      by: userId,
      counts,
    })

    return successResponse({
      deleted: true,
      force,
      organizationName: client.organizationName,
      counts,
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return errorResponse('Client not found', 404, 'NOT_FOUND')
    }
    const message = error instanceof Error ? error.message : 'Failed to delete client'
    logger.error('[ADMIN CLIENTS] delete error', { message }, error as Error)
    return errorResponse(message)
  }
}
