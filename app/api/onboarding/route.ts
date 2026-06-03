import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { clerkClient } from '@clerk/nextjs/server'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, getRateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { onboardingSchema, resolveShippingAddress, serializeClientProfile } from '@/lib/profile'

export const dynamic = 'force-dynamic'

const isClerkConfigured = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_')

/**
 * GET /api/onboarding
 * Returns whether the caller already has a linked practice (so the page can
 * skip the form / redirect appropriately).
 */
export async function GET() {
  const { userId, isAuthenticated } = await requireAuth()
  if (!isAuthenticated || !userId) return unauthorizedResponse()
  if (!prisma) return successResponse({ hasClient: false })

  const user = await prisma.user.findUnique({
    where: { clerkUserId: userId },
    include: { client: true },
  })
  if (!user?.client) return successResponse({ hasClient: false })
  return successResponse({ hasClient: true, profile: serializeClientProfile(user.client) })
}

/**
 * POST /api/onboarding
 * Creates the practice `Client` for a newly signed-up CLIENT, links the user,
 * and mirrors the clientId into Clerk public metadata. Idempotent: if the
 * caller already has a client, returns it unchanged.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) return unauthorizedResponse()

    const rl = checkRateLimit(getRateLimitKey(request, userId), RATE_LIMITS.auth)
    if (rl.limited) {
      return NextResponse.json(
        { error: 'Too Many Requests', message: 'Rate limit exceeded', code: 'RATE_LIMITED' },
        { status: 429, headers: getRateLimitHeaders(rl.remaining, RATE_LIMITS.auth, rl.retryAfter) }
      )
    }

    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const parsed = onboardingSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }
    const data = parsed.data

    // Ensure a local user row exists (webhook normally creates it).
    const user = await prisma.user.upsert({
      where: { clerkUserId: userId },
      update: {},
      create: { clerkUserId: userId, role: 'CLIENT', status: 'PENDING' },
      include: { client: true },
    })

    // Idempotent: already onboarded.
    if (user.client) {
      return successResponse({ success: true, profile: serializeClientProfile(user.client) })
    }

    const shippingAddress = resolveShippingAddress(data)

    let client
    try {
      client = await prisma.client.create({
        data: {
          organizationName: data.organizationName,
          npiNumber: data.npiNumber,
          providerName: data.providerName,
          npiData: (data.npiData as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          contactName: data.contactName,
          contactEmail: data.contactEmail,
          contactPhone: data.contactPhone,
          billingAddress: data.billingAddress as unknown as Prisma.InputJsonValue,
          shippingAddress: shippingAddress as unknown as Prisma.InputJsonValue,
          onboardingStatus: 'PENDING',
          users: { connect: { id: user.id } },
        },
      })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return errorResponse(
          'That NPI number is already registered to another account. Contact support if this is an error.',
          409,
          'NPI_TAKEN'
        )
      }
      throw err
    }

    // Mirror clientId into Clerk so middleware/session can resolve it.
    if (isClerkConfigured) {
      try {
        const clerk = await clerkClient()
        await clerk.users.updateUserMetadata(userId, {
          publicMetadata: { role: 'CLIENT', status: 'PENDING', clientId: client.id },
        })
      } catch (clerkError) {
        logger.error(
          'Failed to set clientId in Clerk metadata',
          { userId, clientId: client.id },
          clerkError instanceof Error ? clerkError : new Error(String(clerkError))
        )
        // Non-fatal: the local link is authoritative for the shop actor resolver.
      }
    }

    logger.info('[ONBOARDING] Client created', { userId, clientId: client.id })
    return successResponse({ success: true, profile: serializeClientProfile(client) }, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onboarding failed'
    logger.error('[ONBOARDING] error', { message }, error instanceof Error ? error : new Error(message))
    return errorResponse(message)
  }
}
