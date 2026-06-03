import { NextRequest } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const isClerkConfigured = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_')

type Metadata = { role?: string; status?: string; clientId?: string }

/**
 * GET /api/admin/users
 * List platform users with role + status. Admin only.
 * Query params: query (search), limit (default 50), offset (default 0).
 */
export async function GET(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')

    if (!isClerkConfigured) {
      // Dev mode without Clerk - no real users to list.
      return successResponse({ users: [], totalCount: 0 })
    }

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('query') || undefined
    const limit = Math.min(Number(searchParams.get('limit')) || 50, 100)
    const offset = Number(searchParams.get('offset')) || 0

    const client = await clerkClient()
    const list = await client.users.getUserList({
      query,
      limit,
      offset,
      orderBy: '-created_at',
    })

    const users = list.data.map((u) => {
      const metadata = (u.publicMetadata || {}) as Metadata
      const primaryEmail =
        u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ??
        u.emailAddresses[0]?.emailAddress ??
        null
      return {
        id: u.id,
        email: primaryEmail,
        firstName: u.firstName,
        lastName: u.lastName,
        imageUrl: u.imageUrl,
        role: metadata.role || 'CLIENT',
        status: metadata.status || 'PENDING',
        clientId: metadata.clientId || null,
        createdAt: u.createdAt,
        lastSignInAt: u.lastSignInAt,
      }
    })

    return successResponse({ users, totalCount: list.totalCount })
  } catch (error) {
    logger.error(
      'Error listing users',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to list users')
  }
}
