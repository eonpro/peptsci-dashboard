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
import { patientCreateSchema, serializePatient } from '@/lib/patient'
import { createPatientForClient } from '@/lib/patients/create'

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
        select: patientSelect,
      }),
      unreadCountsByPatient(id, 'PEPTSCI'),
    ])

    return successResponse({
      patients: patients.map((p) => ({
        ...serializePatient(p),
        unreadMessages: unread[p.id] ?? 0,
      })),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list patients'
    logger.error('[ADMIN PATIENTS] list error', { message }, error as Error)
    return errorResponse(message)
  }
}

/** POST /api/admin/clients/[id]/patients — add a ship-to patient for this clinic. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id: clientId } = await params
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } })
    if (!client) return errorResponse('Client not found', 404, 'NOT_FOUND')

    const parsed = patientCreateSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }

    const patient = await createPatientForClient(clientId, parsed.data)
    return successResponse({ patient }, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add patient'
    logger.error('[ADMIN PATIENTS] create error', { message }, error as Error)
    return errorResponse(message)
  }
}
