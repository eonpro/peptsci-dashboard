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

const resetSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  /** When set, the target user must belong to this practice. */
  clientId: z.string().trim().min(1).optional(),
})

/**
 * POST /api/admin/users/[id]/password
 * Set a new password for an existing Clerk user. Admin only.
 * `[id]` is the Clerk user id. Password is never logged or returned.
 * Signs the user out of other sessions so the new password takes effect cleanly.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')

    const { id: clerkUserId } = await params
    if (!clerkUserId) return errorResponse('User id is required', 400, 'MISSING_ID')

    const parsed = resetSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }
    const { password, clientId } = parsed.data

    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const user = await prisma.user.findUnique({
      where: { clerkUserId },
      select: { id: true, email: true, clientId: true, role: true },
    })
    if (!user) return errorResponse('User not found', 404, 'NOT_FOUND')

    if (clientId && user.clientId !== clientId) {
      return errorResponse('User is not linked to this practice.', 400, 'CLIENT_MISMATCH')
    }

    // Never let this admin path reset platform admin accounts from a client page.
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
      return forbiddenResponse('Cannot reset password for admin accounts from this path')
    }

    if (!isClerkConfigured) {
      return errorResponse('Clerk is not configured.', 503, 'CLERK_UNAVAILABLE')
    }

    const clerk = await clerkClient()
    try {
      await clerk.users.updateUser(clerkUserId, {
        password,
        signOutOfOtherSessions: true,
      })
    } catch (err) {
      const clerkErr = err as { errors?: Array<{ message?: string; code?: string }> }
      const first = clerkErr.errors?.[0]
      if (first) {
        const code = first.code || ''
        if (code.startsWith('form_password') || code.includes('password')) {
          return errorResponse(first.message || 'Password does not meet requirements.', 400, 'WEAK_PASSWORD')
        }
        return errorResponse(first.message || 'Could not reset password.', 400, 'RESET_FAILED')
      }
      throw err
    }

    logger.info('Admin reset user password', {
      clerkUserId,
      email: user.email,
      clientId: user.clientId,
    })

    return successResponse({ message: 'Password updated', id: clerkUserId })
  } catch (error) {
    logger.error(
      'Error resetting password',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to reset password')
  }
}
