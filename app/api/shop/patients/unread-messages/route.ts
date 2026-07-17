import { NextRequest } from 'next/server'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveShopClientId } from '@/lib/shop-actor'
import { unreadCountsByPatient } from '@/lib/patient-messages'

export const dynamic = 'force-dynamic'

/**
 * GET — per-patient count of PeptSci messages the clinic hasn't seen yet.
 * Returns `{ counts: { [patientId]: number } }` for the badge on each card.
 */
export async function GET(_request: NextRequest) {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) return unauthorizedResponse()
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const clientId = await resolveShopClientId(userId)
    if (!clientId) return errorResponse('No client account linked', 403, 'NO_CLIENT')

    const counts = await unreadCountsByPatient(clientId, 'CLINIC')
    return successResponse({ counts })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load unread counts'
    logger.error('[PATIENT MESSAGES] shop unread error', { message }, error as Error)
    return errorResponse(message)
  }
}
