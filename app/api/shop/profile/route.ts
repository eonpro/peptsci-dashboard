import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, getRateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveShopClientId } from '@/lib/shop-actor'
import { profileUpdateSchema, serializeClientProfile } from '@/lib/profile'

export const dynamic = 'force-dynamic'

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

/** GET /api/shop/profile — the caller's own practice profile. */
export async function GET(request: NextRequest) {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) return unauthorizedResponse()
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const clientId = await resolveShopClientId(userId)
    if (!clientId) return errorResponse('No client account linked', 403, 'NO_CLIENT')

    const client = await prisma.client.findUnique({ where: { id: clientId }, select: clientSelect })
    if (!client) return errorResponse('Profile not found', 404, 'NOT_FOUND')
    return successResponse({ profile: serializeClientProfile(client) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load profile'
    logger.error('[PROFILE] get error', { message }, error as Error)
    return errorResponse(message)
  }
}

/**
 * PATCH /api/shop/profile — client self-edit. Once APPROVED, the NPI, provider
 * name, and practice name are locked (admin-only) per compliance; those fields
 * are ignored if sent.
 */
export async function PATCH(request: NextRequest) {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) return unauthorizedResponse()

    const rl = checkRateLimit(getRateLimitKey(request, userId), RATE_LIMITS.standard)
    if (rl.limited) {
      return NextResponse.json(
        { error: 'Too Many Requests', message: 'Rate limit exceeded', code: 'RATE_LIMITED' },
        { status: 429, headers: getRateLimitHeaders(rl.remaining, RATE_LIMITS.standard, rl.retryAfter) }
      )
    }
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const clientId = await resolveShopClientId(userId)
    if (!clientId) return errorResponse('No client account linked', 403, 'NO_CLIENT')

    const parsed = profileUpdateSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }
    const input = parsed.data

    const existing = await prisma.client.findUnique({
      where: { id: clientId },
      select: { onboardingStatus: true },
    })
    if (!existing) return errorResponse('Profile not found', 404, 'NOT_FOUND')
    const locked = existing.onboardingStatus === 'APPROVED'

    const data: Prisma.ClientUpdateInput = {}
    if (input.contactName !== undefined) data.contactName = input.contactName
    if (input.contactEmail !== undefined) data.contactEmail = input.contactEmail
    if (input.contactPhone !== undefined) data.contactPhone = input.contactPhone
    if (input.billingAddress !== undefined)
      data.billingAddress = input.billingAddress as unknown as Prisma.InputJsonValue
    if (input.shippingAddress !== undefined)
      data.shippingAddress = input.shippingAddress as unknown as Prisma.InputJsonValue

    // NPI + practice name are editable only before approval.
    if (!locked) {
      if (input.organizationName !== undefined) data.organizationName = input.organizationName
      if (input.providerName !== undefined) data.providerName = input.providerName
      if (input.npiNumber !== undefined) data.npiNumber = input.npiNumber
    }

    let client
    try {
      client = await prisma.client.update({ where: { id: clientId }, data, select: clientSelect })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return errorResponse('That NPI number is already registered to another account.', 409, 'NPI_TAKEN')
      }
      throw err
    }

    return successResponse({ profile: serializeClientProfile(client), locked })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update profile'
    logger.error('[PROFILE] patch error', { message }, error as Error)
    return errorResponse(message)
  }
}
