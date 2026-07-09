import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { clerkClient } from '@clerk/nextjs/server'
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
import { npiSchema, serializeClientProfile } from '@/lib/profile'
import {
  sendPartnerApprovedEmail,
  sendPartnerRejectedEmail,
  sendPartnerNeedsInfoEmail,
} from '@/lib/email'
import { deleteClientForce } from '@/lib/clients/delete-client'

export const dynamic = 'force-dynamic'

const isClerkConfigured = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_')

const clientSelect = {
  id: true,
  organizationName: true,
  npiNumber: true,
  providerName: true,
  contactName: true,
  contactEmail: true,
  contactPhone: true,
  billingAddress: true,
  shippingAddress: true,
  onboardingStatus: true,
} as const

const adminUpdateSchema = z.object({
  organizationName: z.string().trim().min(2).max(200).optional(),
  providerName: z.string().trim().min(2).max(200).optional(),
  npiNumber: npiSchema.optional(),
  contactName: z.string().trim().min(2).max(120).optional(),
  contactEmail: z.string().trim().email().max(200).optional(),
  contactPhone: z.string().trim().min(7).max(30).optional(),
  billingAddress: addressSchema.optional(),
  shippingAddress: addressSchema.optional(),
  onboardingStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'NEEDS_INFO']).optional(),
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
        _count: { select: { orders: true, patients: true } },
      },
    })
    if (!client) return errorResponse('Client not found', 404, 'NOT_FOUND')

    return successResponse({
      profile: serializeClientProfile(client),
      users: client.users,
      counts: client._count,
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
    if (input.contactName !== undefined) data.contactName = input.contactName
    if (input.contactEmail !== undefined) data.contactEmail = input.contactEmail
    if (input.contactPhone !== undefined) data.contactPhone = input.contactPhone
    if (input.billingAddress !== undefined)
      data.billingAddress = input.billingAddress as unknown as Prisma.InputJsonValue
    if (input.shippingAddress !== undefined)
      data.shippingAddress = input.shippingAddress as unknown as Prisma.InputJsonValue
    if (input.onboardingStatus !== undefined) data.onboardingStatus = input.onboardingStatus

    let client
    try {
      client = await prisma.client.update({
        where: { id },
        data,
        select: {
          ...clientSelect,
          users: { select: { id: true, clerkUserId: true, email: true } },
        },
      })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002')
          return errorResponse('That NPI number is already registered to another account.', 409, 'NPI_TAKEN')
        if (err.code === 'P2025') return errorResponse('Client not found', 404, 'NOT_FOUND')
      }
      throw err
    }

    // Cascade approval/rejection to the linked users.
    if (input.onboardingStatus === 'APPROVED' || input.onboardingStatus === 'REJECTED') {
      const newStatus = input.onboardingStatus === 'APPROVED' ? 'ACTIVE' : 'SUSPENDED'
      await prisma.user.updateMany({ where: { clientId: id }, data: { status: newStatus } })

      if (isClerkConfigured) {
        const clerk = await clerkClient()
        await Promise.all(
          client.users.map(async (u) => {
            try {
              await clerk.users.updateUserMetadata(u.clerkUserId, {
                publicMetadata: { role: 'CLIENT', status: newStatus, clientId: id },
              })
            } catch (e) {
              logger.error(
                'Failed to sync user status to Clerk',
                { userId: u.id },
                e instanceof Error ? e : new Error(String(e))
              )
            }
          })
        )
      }
      logger.info('[ADMIN CLIENTS] status cascade', { clientId: id, newStatus })
    }

    // Notify the partner of the onboarding decision. Recipients = the practice
    // contact + any linked user emails. Senders never throw.
    if (input.onboardingStatus) {
      const recipients = Array.from(
        new Set(
          [client.contactEmail, ...client.users.map((u) => u.email)].filter(
            (e): e is string => Boolean(e)
          )
        )
      )
      const name = client.contactName || client.organizationName
      if (recipients.length > 0) {
        if (input.onboardingStatus === 'APPROVED') {
          await sendPartnerApprovedEmail({ to: recipients, name })
        } else if (input.onboardingStatus === 'REJECTED') {
          await sendPartnerRejectedEmail({ to: recipients, name })
        } else if (input.onboardingStatus === 'NEEDS_INFO') {
          await sendPartnerNeedsInfoEmail({ to: recipients, name })
        }
      }
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
