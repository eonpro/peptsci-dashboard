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
import { resolvePermissions, sanitizePermissions } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

const isClerkConfigured = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_')

type Metadata = {
  role?: string
  status?: string
  clientId?: string
  permissionsGrant?: string[]
  permissionsDeny?: string[]
}

const createUserSchema = z.object({
  email: z.string().trim().email('Enter a valid email').max(200),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  clientId: z.string().trim().min(1, 'Practice is required'),
})

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
      const role = metadata.role || 'CLIENT'
      const permissionsGrant = sanitizePermissions(metadata.permissionsGrant)
      const permissionsDeny = sanitizePermissions(metadata.permissionsDeny)
      return {
        id: u.id,
        email: primaryEmail,
        firstName: u.firstName,
        lastName: u.lastName,
        imageUrl: u.imageUrl,
        role,
        status: metadata.status || 'PENDING',
        clientId: metadata.clientId || null,
        permissionsGrant,
        permissionsDeny,
        permissions: resolvePermissions({
          role,
          permissionsGrant,
          permissionsDeny,
        }),
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

/**
 * POST /api/admin/users
 * Create a Clerk login with an admin-chosen password and link it to a practice.
 * Admin only. Password is never logged or returned.
 */
export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')

    const parsed = createUserSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }
    const { email, password, firstName, lastName, clientId } = parsed.data

    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, organizationName: true },
    })
    if (!client) return errorResponse('Selected client not found', 400, 'CLIENT_NOT_FOUND')

    if (!isClerkConfigured) {
      return errorResponse('Clerk is not configured; cannot create users.', 503, 'CLERK_UNAVAILABLE')
    }

    const clerk = await clerkClient()

    let clerkUser
    try {
      clerkUser = await clerk.users.createUser({
        emailAddress: [email],
        password,
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
        publicMetadata: {
          role: 'CLIENT',
          // Admin-provisioned logins are pre-vetted (same as invite).
          status: 'ACTIVE',
          clientId,
        },
      })
    } catch (err) {
      const clerkErr = err as { errors?: Array<{ message?: string; code?: string }>; status?: number }
      const first = clerkErr.errors?.[0]
      if (first) {
        const code = first.code || ''
        if (code === 'form_identifier_exists' || code === 'duplicate_record') {
          return errorResponse('A user with that email already exists.', 409, 'USER_EXISTS')
        }
        if (code.startsWith('form_password') || code.includes('password')) {
          return errorResponse(first.message || 'Password does not meet requirements.', 400, 'WEAK_PASSWORD')
        }
        return errorResponse(first.message || 'Could not create user.', 400, 'CREATE_FAILED')
      }
      throw err
    }

    const dbUser = await prisma.user.upsert({
      where: { clerkUserId: clerkUser.id },
      update: {
        email,
        firstName: firstName || clerkUser.firstName || undefined,
        lastName: lastName || clerkUser.lastName || undefined,
        role: 'CLIENT',
        status: 'ACTIVE',
        clientId,
      },
      create: {
        clerkUserId: clerkUser.id,
        email,
        firstName: firstName || clerkUser.firstName || undefined,
        lastName: lastName || clerkUser.lastName || undefined,
        role: 'CLIENT',
        status: 'ACTIVE',
        clientId,
      },
      select: {
        id: true,
        clerkUserId: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
      },
    })

    logger.info('Admin created client login', {
      clerkUserId: clerkUser.id,
      email,
      clientId,
      organizationName: client.organizationName,
    })

    return successResponse(
      {
        user: {
          id: dbUser.id,
          clerkUserId: dbUser.clerkUserId,
          email: dbUser.email,
          firstName: dbUser.firstName,
          lastName: dbUser.lastName,
          role: dbUser.role,
          status: dbUser.status,
        },
      },
      201
    )
  } catch (error) {
    logger.error(
      'Error creating user',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to create user')
  }
}
