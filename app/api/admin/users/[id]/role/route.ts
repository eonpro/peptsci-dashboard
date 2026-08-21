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
import { isStaffRole, type UserRole } from '@/lib/access'
import { PERMISSIONS, sanitizePermissions } from '@/lib/permissions'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const staffRoles = [
  'CLIENT',
  'ADMIN',
  'SUPER_ADMIN',
  'PARTNER',
  'FULFILLMENT',
  'BILLING',
  'CATALOG',
  'FINANCE_VIEWER',
] as const

const updateRoleSchema = z.object({
  role: z.enum(staffRoles),
  permissionsGrant: z.array(z.enum(PERMISSIONS)).optional(),
  permissionsDeny: z.array(z.enum(PERMISSIONS)).optional(),
})

/**
 * PUT /api/admin/users/[id]/role
 * Update a user's role and optional permission overrides.
 * Super Admin only (users:roles).
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated) {
      return unauthorizedResponse()
    }

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
    const grant = sanitizePermissions(parseResult.data.permissionsGrant ?? [])
    const deny = sanitizePermissions(parseResult.data.permissionsDeny ?? [])
    // Overrides only make sense on staff accounts; clear them for CLIENT.
    const permissionsGrant = isStaffRole(newRole as UserRole) ? grant : []
    const permissionsDeny = isStaffRole(newRole as UserRole) ? deny : []

    const previous = prisma
      ? await prisma.user.findUnique({
          where: { clerkUserId: targetUserId },
          select: { role: true, permissionsGrant: true, permissionsDeny: true },
        })
      : null

    const client = await clerkClient()
    const existing = await client.users.getUser(targetUserId)
    const prevMeta = (existing.publicMetadata || {}) as Record<string, unknown>
    await client.users.updateUserMetadata(targetUserId, {
      publicMetadata: {
        ...prevMeta,
        role: newRole,
        permissionsGrant,
        permissionsDeny,
      },
    })

    if (prisma) {
      await prisma.user.updateMany({
        where: { clerkUserId: targetUserId },
        data: {
          role: newRole,
          permissionsGrant,
          permissionsDeny,
        },
      })
    }

    logger.info('User role updated', {
      targetUserId,
      newRole,
      permissionsGrant,
      permissionsDeny,
      updatedBy: userId,
    })
    void writeAudit({
      clerkUserId: userId,
      entity: 'User',
      entityId: targetUserId,
      action: 'role_changed',
      metadata: {
        from: previous?.role ?? null,
        to: newRole,
        permissionsGrant,
        permissionsDeny,
        previousGrant: previous?.permissionsGrant ?? [],
        previousDeny: previous?.permissionsDeny ?? [],
      },
    })

    return successResponse({
      message: 'User role updated successfully',
      userId: targetUserId,
      role: newRole,
      permissionsGrant,
      permissionsDeny,
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
