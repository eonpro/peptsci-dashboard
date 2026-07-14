import { NextRequest } from 'next/server'
import { z } from 'zod'
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

export const dynamic = 'force-dynamic'

const isClerkConfigured = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_')

const patchSchema = z
  .object({
    // Pass null to unlink the user from any client.
    clientId: z.string().trim().min(1).nullable().optional(),
    status: z.enum(['ACTIVE', 'PENDING', 'SUSPENDED']).optional(),
  })
  .refine((v) => v.clientId !== undefined || v.status !== undefined, {
    message: 'Nothing to update',
  })

/**
 * PATCH /api/admin/users/[id]
 * Update an existing user's client assignment and/or account status.
 * Keeps Clerk publicMetadata and the Postgres mirror in sync. Admin only.
 * (Role changes stay on the dedicated /role route which is Super Admin gated.)
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')

    const { id: clerkUserId } = await params
    if (!clerkUserId) return errorResponse('User id is required', 400, 'MISSING_ID')

    const parsed = patchSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }
    const { clientId, status } = parsed.data

    // Validate the target client exists before assigning.
    if (clientId && prisma) {
      const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { id: true },
      })
      if (!client) return errorResponse('Selected client not found', 400, 'CLIENT_NOT_FOUND')
    }

    // Activating a practice-linked login must not sidestep the onboarding
    // decision: shop access follows User.status, so an ACTIVE user on a
    // PENDING/REJECTED practice would grant ordering to an unapproved clinic.
    // Approve the practice (which cascades to its users) instead.
    if (status === 'ACTIVE' && prisma) {
      const effectiveClientId =
        clientId !== undefined
          ? clientId
          : ((await prisma.user.findUnique({
              where: { clerkUserId },
              select: { clientId: true },
            }))?.clientId ?? null)
      if (effectiveClientId) {
        const linked = await prisma.client.findUnique({
          where: { id: effectiveClientId },
          select: { onboardingStatus: true, organizationName: true },
        })
        if (linked && linked.onboardingStatus !== 'APPROVED') {
          return errorResponse(
            `${linked.organizationName || 'The linked practice'} is ${linked.onboardingStatus} — approve the practice from its client page first (that activates its users).`,
            409,
            'PRACTICE_NOT_APPROVED'
          )
        }
      }
    }

    if (isClerkConfigured) {
      const clerk = await clerkClient()
      const publicMetadata: Record<string, unknown> = {}
      if (status !== undefined) publicMetadata.status = status
      // Clerk removes a metadata key when its value is null.
      if (clientId !== undefined) publicMetadata.clientId = clientId
      await clerk.users.updateUserMetadata(clerkUserId, { publicMetadata })
    }

    if (prisma) {
      const data: { clientId?: string | null; status?: 'ACTIVE' | 'PENDING' | 'SUSPENDED' } = {}
      if (clientId !== undefined) data.clientId = clientId
      if (status !== undefined) data.status = status
      await prisma.user.updateMany({ where: { clerkUserId }, data })
    }

    logger.info('User updated', { clerkUserId, clientId: clientId ?? null, status: status ?? null })

    return successResponse({
      message: 'User updated',
      id: clerkUserId,
      ...(clientId !== undefined ? { clientId } : {}),
      ...(status !== undefined ? { status } : {}),
    })
  } catch (error) {
    logger.error('Error updating user', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to update user')
  }
}
