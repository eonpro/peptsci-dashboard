import { NextRequest, NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import {
  requireAuth,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { getUserMetadata } from '@/lib/roles'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { writeAudit } from '@/lib/audit'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const updateRoleSchema = z.object({
  role: z.enum(['CLIENT', 'ADMIN', 'SUPER_ADMIN']),
})

/**
 * PUT /api/admin/users/[id]/role
 * Update a user's role.
 * Super Admin only.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Authenticate request
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated) {
      return unauthorizedResponse()
    }

    // Check if user is super admin (only super admins can change roles)
    const metadata = await getUserMetadata()
    if (metadata.role !== 'SUPER_ADMIN') {
      return forbiddenResponse('Super Admin access required to change roles')
    }

    const { id: targetUserId } = await params

    if (!targetUserId) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'User ID required', code: 'MISSING_USER_ID' },
        { status: 400 }
      )
    }

    // Parse and validate request body
    const body = await request.json()
    const parseResult = updateRoleSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Bad Request',
          message: parseResult.error.errors.map((e) => e.message).join(', '),
          code: 'VALIDATION_ERROR',
        },
        { status: 400 }
      )
    }

    const { role: newRole } = parseResult.data

    // Snapshot the previous role for the audit trail.
    const previousRole = prisma
      ? (
          await prisma.user.findUnique({
            where: { clerkUserId: targetUserId },
            select: { role: true },
          })
        )?.role ?? null
      : null

    // Update Clerk user metadata
    const client = await clerkClient()
    await client.users.updateUserMetadata(targetUserId, {
      publicMetadata: {
        role: newRole,
      },
    })

    // Update database if configured
    if (prisma) {
      await prisma.user.updateMany({
        where: { clerkUserId: targetUserId },
        data: { role: newRole },
      })
    }

    logger.info('User role updated', { targetUserId, newRole, updatedBy: userId })
    void writeAudit({
      clerkUserId: userId,
      entity: 'User',
      entityId: targetUserId,
      action: 'role_changed',
      metadata: { from: previousRole, to: newRole },
    })

    return successResponse({
      message: 'User role updated successfully',
      userId: targetUserId,
      role: newRole,
    })
  } catch (error) {
    logger.error(
      'Error updating user role',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to update user role')
  }
}
