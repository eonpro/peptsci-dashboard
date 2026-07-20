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
import { sendPartnerClinicAttributedEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

const matchSchema = z.object({
  leadId: z.string().trim().min(1),
  clientId: z.string().trim().min(1),
})

/**
 * PATCH /api/admin/partners/[id]/leads — manually match a registered lead to
 * an existing clinic (attributes the clinic to the lead's org/rep and marks
 * the lead CONVERTED). For ambiguous cases the auto-match couldn't resolve.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await context.params
    const parsed = matchSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse('Invalid request', 400, 'VALIDATION_ERROR')
    const { leadId, clientId } = parsed.data

    const lead = await prisma.partnerLead.findFirst({
      where: { id: leadId, orgId: id },
      include: { org: { select: { contactEmail: true, contactName: true, notifyByEmail: true } } },
    })
    if (!lead) return errorResponse('Lead not found', 404, 'NOT_FOUND')
    if (lead.status === 'CONVERTED') {
      return errorResponse('Lead is already converted', 409, 'ALREADY_CONVERTED')
    }

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, organizationName: true, partnerOrgId: true },
    })
    if (!client) return errorResponse('Clinic not found', 404, 'CLIENT_NOT_FOUND')
    if (client.partnerOrgId && client.partnerOrgId !== id) {
      return errorResponse('Clinic is already attributed to another partner org', 409, 'ALREADY_ATTRIBUTED')
    }

    await prisma.$transaction([
      prisma.client.update({
        where: { id: clientId },
        data: { partnerOrgId: id, partnerRepId: lead.repId },
      }),
      prisma.partnerLead.update({
        where: { id: leadId },
        data: { status: 'CONVERTED', matchedClientId: clientId },
      }),
    ])

    if (lead.org.notifyByEmail) {
      sendPartnerClinicAttributedEmail({
        to: lead.org.contactEmail,
        contactName: lead.org.contactName,
        clinicName: client.organizationName,
        via: 'lead',
      }).catch(() => {})
    }

    logger.info('[ADMIN PARTNERS] Lead manually matched', { orgId: id, leadId, clientId })
    return successResponse({ success: true })
  } catch (error) {
    logger.error('Error matching lead', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to match lead')
  }
}
