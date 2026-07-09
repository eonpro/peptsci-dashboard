import { NextRequest } from 'next/server'
import { z } from 'zod'
import { clerkClient } from '@clerk/nextjs/server'
import {
  requireAdmin,
  requireSuperAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const isClerkConfigured = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_')
// Match the codebase fallback (lib/email, lib/sms) so production invite links
// stay on the real domain even if NEXT_PUBLIC_APP_URL is unset at build time.
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://peptsci.com').replace(/\/$/, '')

const inviteSchema = z.object({
  email: z.string().trim().email('Enter a valid email').max(200),
  role: z.enum(['CLIENT', 'ADMIN', 'SUPER_ADMIN']).default('CLIENT'),
  clientId: z.string().trim().min(1).optional(),
})

type InvitationMetadata = { role?: string; status?: string; clientId?: string }

/**
 * GET /api/admin/users/invite
 * List pending Clerk invitations. Admin only.
 */
export async function GET() {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')

    if (!isClerkConfigured) {
      return successResponse({ invitations: [] })
    }

    const clerk = await clerkClient()
    const list = await clerk.invitations.getInvitationList({ status: 'pending' })

    const invitations = list.data.map((inv) => {
      const metadata = (inv.publicMetadata || {}) as InvitationMetadata
      return {
        id: inv.id,
        email: inv.emailAddress,
        role: metadata.role || 'CLIENT',
        clientId: metadata.clientId || null,
        status: inv.status,
        createdAt: inv.createdAt,
      }
    })

    return successResponse({ invitations })
  } catch (error) {
    logger.error(
      'Error listing invitations',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to list invitations')
  }
}

/**
 * POST /api/admin/users/invite
 * Send a Clerk email invitation to a new user, seeding role/status/clientId
 * into the invitation's publicMetadata so it carries over on sign-up.
 * Admin only; granting ADMIN/SUPER_ADMIN requires Super Admin.
 */
export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')

    const parsed = inviteSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }
    const { email, role, clientId } = parsed.data

    // Only super admins may grant elevated roles.
    if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
      const { isSuperAdmin } = await requireSuperAdmin()
      if (!isSuperAdmin) {
        return forbiddenResponse('Super Admin access required to grant admin roles')
      }
    }

    // Guard against linking to a non-existent client.
    if (clientId && prisma) {
      const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } })
      if (!client) return errorResponse('Selected client not found', 400, 'CLIENT_NOT_FOUND')
    }

    if (!isClerkConfigured) {
      return errorResponse('Clerk is not configured; cannot send invitations.', 503, 'CLERK_UNAVAILABLE')
    }

    const clerk = await clerkClient()

    try {
      const invitation = await clerk.invitations.createInvitation({
        emailAddress: email,
        publicMetadata: {
          role,
          // Admin-initiated invites are pre-vetted, so the account is active on sign-up.
          status: 'ACTIVE',
          ...(clientId ? { clientId } : {}),
        },
        redirectUrl: `${APP_URL}/sign-up`,
        ignoreExisting: false,
      })

      logger.info('User invitation sent', { email, role, clientId: clientId ?? null })

      return successResponse(
        {
          invitation: {
            id: invitation.id,
            email: invitation.emailAddress,
            role,
            clientId: clientId ?? null,
            status: invitation.status,
            createdAt: invitation.createdAt,
          },
        },
        201
      )
    } catch (err) {
      // Clerk surfaces duplicate-invite / already-a-member as 4xx errors.
      const clerkErr = err as { errors?: Array<{ message?: string; code?: string }>; status?: number }
      const first = clerkErr.errors?.[0]
      if (first) {
        const message =
          first.code === 'duplicate_record'
            ? 'An invitation for this email is already pending.'
            : first.message || 'Could not send invitation.'
        return errorResponse(message, 409, 'INVITE_FAILED')
      }
      throw err
    }
  } catch (error) {
    logger.error(
      'Error creating invitation',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to create invitation')
  }
}

/**
 * DELETE /api/admin/users/invite?id=<invitationId>
 * Revoke a pending Clerk invitation. Admin only.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')

    const invitationId = new URL(request.url).searchParams.get('id')
    if (!invitationId) return errorResponse('Invitation id is required', 400, 'MISSING_ID')

    if (!isClerkConfigured) {
      return errorResponse('Clerk is not configured.', 503, 'CLERK_UNAVAILABLE')
    }

    const clerk = await clerkClient()
    await clerk.invitations.revokeInvitation(invitationId)

    logger.info('User invitation revoked', { invitationId })

    return successResponse({ message: 'Invitation revoked', id: invitationId })
  } catch (error) {
    logger.error(
      'Error revoking invitation',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to revoke invitation')
  }
}
