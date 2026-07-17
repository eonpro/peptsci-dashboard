import { NextRequest } from 'next/server'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { unreadCountsByPatient } from '@/lib/patient-messages'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/clients/[id]/patients — the practice's saved patients with
 * per-patient counts of clinic messages the staff hasn't read yet.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const [patients, unread] = await Promise.all([
      prisma.patient.findMany({
        where: { clientId: id, isActive: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      }),
      unreadCountsByPatient(id, 'PEPTSCI'),
    ])

    return successResponse({
      patients: patients.map((p) => ({ ...p, unreadMessages: unread[p.id] ?? 0 })),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list patients'
    logger.error('[ADMIN PATIENTS] list error', { message }, error as Error)
    return errorResponse(message)
  }
}
