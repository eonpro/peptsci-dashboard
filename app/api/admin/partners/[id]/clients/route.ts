import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { writeAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

const attachSchema = z.object({
  clientId: z.string().trim().min(1),
  repId: z.string().trim().min(1).nullable().optional(),
})

/**
 * POST /api/admin/partners/[id]/clients — manually attribute a clinic to this
 * partner org (and optionally a rep). Only affects FUTURE transactions.
 */
export async function POST(request: NextRequest, context: Params) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await context.params
    const parsed = attachSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse('Invalid request', 400, 'VALIDATION_ERROR')
    const { clientId, repId } = parsed.data

    const [org, client] = await Promise.all([
      prisma.partnerOrg.findUnique({ where: { id }, select: { id: true } }),
      prisma.client.findUnique({ where: { id: clientId }, select: { id: true, partnerOrgId: true } }),
    ])
    if (!org) return errorResponse('Partner org not found', 404, 'NOT_FOUND')
    if (!client) return errorResponse('Clinic not found', 404, 'CLIENT_NOT_FOUND')
    if (client.partnerOrgId && client.partnerOrgId !== id) {
      return errorResponse(
        'This clinic is already attributed to another partner org. Detach it there first.',
        409,
        'ALREADY_ATTRIBUTED'
      )
    }
    if (repId) {
      const rep = await prisma.partnerRep.findFirst({ where: { id: repId, orgId: id }, select: { id: true } })
      if (!rep) return errorResponse('Rep not found in this org', 400, 'REP_NOT_FOUND')
    }

    await prisma.client.update({
      where: { id: clientId },
      data: { partnerOrgId: id, partnerRepId: repId ?? null },
    })
    logger.info('[ADMIN PARTNERS] Clinic attributed', { orgId: id, clientId, repId: repId ?? null })
    void writeAudit({
      clerkUserId: userId,
      entity: 'Client',
      entityId: clientId,
      action: 'partner_attributed',
      metadata: { orgId: id, repId: repId ?? null },
    })
    return successResponse({ success: true })
  } catch (error) {
    logger.error(
      'Error attributing clinic',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to attribute clinic')
  }
}

/**
 * DELETE /api/admin/partners/[id]/clients?clientId=… — remove a clinic's
 * attribution (historic ledger rows are untouched).
 */
export async function DELETE(request: NextRequest, context: Params) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await context.params
    const clientId = new URL(request.url).searchParams.get('clientId')
    if (!clientId) return errorResponse('clientId is required', 400, 'MISSING_CLIENT_ID')

    const result = await prisma.client.updateMany({
      where: { id: clientId, partnerOrgId: id },
      data: { partnerOrgId: null, partnerRepId: null, referralLinkId: null },
    })
    if (result.count === 0) {
      return errorResponse('Clinic is not attributed to this org', 404, 'NOT_ATTRIBUTED')
    }
    logger.info('[ADMIN PARTNERS] Clinic detached', { orgId: id, clientId })
    void writeAudit({
      clerkUserId: userId,
      entity: 'Client',
      entityId: clientId,
      action: 'partner_detached',
      metadata: { orgId: id },
    })
    return successResponse({ success: true })
  } catch (error) {
    logger.error(
      'Error detaching clinic',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to detach clinic')
  }
}
