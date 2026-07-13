import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, getRateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveShopClientId } from '@/lib/shop-actor'
import { patientUpdateSchema, serializePatient } from '@/lib/patient'

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

async function authOwnedPatient(request: NextRequest, patientId: string) {
  const { userId, isAuthenticated } = await requireAuth()
  if (!isAuthenticated || !userId) return { error: unauthorizedResponse() }

  const rl = await checkRateLimit(getRateLimitKey(request, userId), RATE_LIMITS.standard)
  if (rl.limited) {
    return {
      error: NextResponse.json(
        { error: 'Too Many Requests', message: 'Rate limit exceeded', code: 'RATE_LIMITED' },
        { status: 429, headers: getRateLimitHeaders(rl.remaining, RATE_LIMITS.standard, rl.retryAfter) }
      ),
    }
  }
  if (!prisma) return { error: errorResponse('Database not connected', 503, 'DB_UNAVAILABLE') }

  const clientId = await resolveShopClientId(userId)
  if (!clientId) return { error: errorResponse('No client account linked', 403, 'NO_CLIENT') }

  const patient = await prisma.patient.findFirst({ where: { id: patientId, clientId } })
  if (!patient) return { error: errorResponse('Patient not found', 404, 'NOT_FOUND') }
  return { clientId, patient }
}

/** PATCH — edit a saved patient. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await authOwnedPatient(request, id)
    if ('error' in auth) return auth.error

    const parsed = patientUpdateSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }
    const d = parsed.data
    const data: Prisma.PatientUpdateInput = {}
    if (d.firstName !== undefined) data.firstName = d.firstName
    if (d.lastName !== undefined) data.lastName = d.lastName
    if (d.address !== undefined) data.address = d.address as unknown as Prisma.InputJsonValue
    if (d.phone !== undefined) data.phone = d.phone || null
    if (d.email !== undefined) data.email = d.email || null
    if (d.notes !== undefined) data.notes = d.notes || null

    const patient = await prisma!.patient.update({ where: { id }, data, select: patientSelect })
    return successResponse({ patient: serializePatient(patient) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update patient'
    logger.error('[PATIENTS] update error', { message }, error as Error)
    return errorResponse(message)
  }
}

/** DELETE — soft-delete a saved patient. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await authOwnedPatient(request, id)
    if ('error' in auth) return auth.error

    await prisma!.patient.update({ where: { id }, data: { isActive: false } })
    return successResponse({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to remove patient'
    logger.error('[PATIENTS] delete error', { message }, error as Error)
    return errorResponse(message)
  }
}
