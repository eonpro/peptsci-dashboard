import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, getRateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveShopClientId } from '@/lib/shop-actor'
import { patientCreateSchema, serializePatient } from '@/lib/patient'

export const dynamic = 'force-dynamic'

const patientSelect = {
  id: true,
  firstName: true,
  lastName: true,
  address: true,
  phone: true,
  email: true,
  notes: true,
} as const

/** GET — list the practice's saved patients (ship-to recipients). */
export async function GET(request: NextRequest) {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) return unauthorizedResponse()
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const clientId = await resolveShopClientId(userId)
    if (!clientId) return errorResponse('No client account linked', 403, 'NO_CLIENT')

    const patients = await prisma.patient.findMany({
      where: { clientId, isActive: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: patientSelect,
    })
    return successResponse({ patients: patients.map(serializePatient) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list patients'
    logger.error('[PATIENTS] list error', { message }, error as Error)
    return errorResponse(message)
  }
}

/** POST — add a saved patient. */
export async function POST(request: NextRequest) {
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

    const parsed = patientCreateSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }
    const d = parsed.data

    const patient = await prisma.patient.create({
      data: {
        clientId,
        firstName: d.firstName,
        lastName: d.lastName,
        address: d.address as unknown as Prisma.InputJsonValue,
        phone: d.phone || null,
        email: d.email || null,
        notes: d.notes || null,
      },
      select: patientSelect,
    })
    return successResponse({ patient: serializePatient(patient) }, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add patient'
    logger.error('[PATIENTS] create error', { message }, error as Error)
    return errorResponse(message)
  }
}
