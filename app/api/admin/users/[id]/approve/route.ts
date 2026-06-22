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
import { sendPartnerApprovedEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/users/[id]/approve
 * Approve a pending user, allowing them to access the platform.
 * Admin or Super Admin only.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Authenticate request
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated) {
      return unauthorizedResponse()
    }

    // Check if user is admin
    const metadata = await getUserMetadata()
    if (metadata.role !== 'ADMIN' && metadata.role !== 'SUPER_ADMIN') {
      return forbiddenResponse('Admin access required')
    }

    const { id: targetUserId } = await params

    if (!targetUserId) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'User ID required', code: 'MISSING_USER_ID' },
        { status: 400 }
      )
    }

    // Update Clerk user metadata
    const client = await clerkClient()
    await client.users.updateUserMetadata(targetUserId, {
      publicMetadata: {
        status: 'ACTIVE',
      },
    })

    // Update database if configured
    let approvedUser: { email: string | null; firstName: string | null } | null = null
    if (prisma) {
      await prisma.user.updateMany({
        where: { clerkUserId: targetUserId },
        data: { status: 'ACTIVE' },
      })
      approvedUser = await prisma.user.findFirst({
        where: { clerkUserId: targetUserId },
        select: { email: true, firstName: true },
      })
    }

    logger.info('User approved', { targetUserId, approvedBy: userId })

    // Notify the partner that they're approved. Never throws.
    if (approvedUser?.email) {
      await sendPartnerApprovedEmail({ to: approvedUser.email, name: approvedUser.firstName })
    }

    return successResponse({
      message: 'User approved successfully',
      userId: targetUserId,
      status: 'ACTIVE',
    })
  } catch (error) {
    logger.error(
      'Error approving user',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to approve user')
  }
}

/**
 * DELETE /api/admin/users/[id]/approve
 * Reject/suspend a user.
 * Admin or Super Admin only.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate request
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated) {
      return unauthorizedResponse()
    }

    // Check if user is admin
    const metadata = await getUserMetadata()
    if (metadata.role !== 'ADMIN' && metadata.role !== 'SUPER_ADMIN') {
      return forbiddenResponse('Admin access required')
    }

    const { id: targetUserId } = await params

    if (!targetUserId) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'User ID required', code: 'MISSING_USER_ID' },
        { status: 400 }
      )
    }

    // Update Clerk user metadata
    const client = await clerkClient()
    await client.users.updateUserMetadata(targetUserId, {
      publicMetadata: {
        status: 'SUSPENDED',
      },
    })

    // Update database if configured
    if (prisma) {
      await prisma.user.updateMany({
        where: { clerkUserId: targetUserId },
        data: { status: 'SUSPENDED' },
      })
    }

    logger.info('User suspended', { targetUserId, suspendedBy: userId })

    return successResponse({
      message: 'User suspended successfully',
      userId: targetUserId,
      status: 'SUSPENDED',
    })
  } catch (error) {
    logger.error(
      'Error suspending user',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to suspend user')
  }
}
