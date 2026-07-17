import { NextRequest } from 'next/server'
import { z } from 'zod'
import { errorResponse, forbiddenResponse, successResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { requirePartner, PartnerForbiddenError } from '@/lib/partners/auth'
import { invitePartnerMember, PartnerProvisionError } from '@/lib/partners/provision'

export const dynamic = 'force-dynamic'

/** GET /api/partners/team — org teammates (owner/admin only). */
export async function GET() {
  try {
    const ctx = await requirePartner({ orgOnly: true, minRole: 'ADMIN' })
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const members = await prisma.partnerOrgMember.findMany({
      where: { orgId: ctx.org.id },
      orderBy: { createdAt: 'asc' },
    })
    return successResponse({
      owner: { email: ctx.org.contactEmail, name: ctx.org.contactName, hasLogin: Boolean(ctx.org.clerkUserId) },
      members: members.map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        role: m.role,
        status: m.status,
        hasLogin: Boolean(m.clerkUserId),
        invitedAt: m.invitedAt,
      })),
    })
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    logger.error('Error listing team', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to list team')
  }
}

const inviteSchema = z.object({
  name: z.string().trim().min(2).max(200),
  email: z.string().trim().email().max(255),
  role: z.enum(['ADMIN', 'VIEWER']).default('VIEWER'),
})

/** POST /api/partners/team — invite a teammate (org ADMIN+). */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requirePartner({ orgOnly: true, minRole: 'ADMIN' })
    const parsed = inviteSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }
    const result = await invitePartnerMember(ctx.org.id, {
      ...parsed.data,
      invitedBy: ctx.userId,
    })
    return successResponse({ success: true, memberId: result.memberId }, 201)
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    if (error instanceof PartnerProvisionError) return errorResponse(error.message, error.status, error.code)
    logger.error('Error inviting teammate', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to invite teammate')
  }
}

const patchSchema = z.object({
  memberId: z.string().trim().min(1),
  role: z.enum(['ADMIN', 'VIEWER']).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
})

/** PATCH /api/partners/team — change a teammate's role or suspend them. */
export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requirePartner({ orgOnly: true, minRole: 'ADMIN' })
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const parsed = patchSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse('Invalid request', 400, 'VALIDATION_ERROR')
    const { memberId, ...data } = parsed.data

    const result = await prisma.partnerOrgMember.updateMany({
      where: { id: memberId, orgId: ctx.org.id },
      data,
    })
    if (result.count === 0) return errorResponse('Teammate not found', 404, 'NOT_FOUND')
    return successResponse({ success: true })
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    logger.error('Error updating teammate', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to update teammate')
  }
}
