import { NextRequest } from 'next/server'
import { z } from 'zod'
import { errorResponse, forbiddenResponse, successResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { requirePartner, PartnerForbiddenError, type PartnerContext } from '@/lib/partners/auth'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/** Reps only see their own clinics; org users see the whole book. */
async function resolveClinic(ctx: PartnerContext, clientId: string) {
  return prisma!.client.findFirst({
    where: {
      id: clientId,
      partnerOrgId: ctx.org.id,
      ...(ctx.kind === 'REP' ? { partnerRepId: ctx.rep!.id } : {}),
    },
    select: {
      id: true,
      organizationName: true,
      contactName: true,
      contactEmail: true,
      contactPhone: true,
      onboardingStatus: true,
      createdAt: true,
      partnerRep: { select: { id: true, name: true } },
    },
  })
}

/**
 * GET /api/partners/clinics/[id] — CRM view: clinic, stage/tags, activity
 * timeline, and its transactions.
 */
export async function GET(_request: NextRequest, context: Params) {
  try {
    const ctx = await requirePartner()
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')
    const { id } = await context.params

    const clinic = await resolveClinic(ctx, id)
    if (!clinic) return errorResponse('Clinic not found', 404, 'NOT_FOUND')

    const [meta, activity, transactions] = await Promise.all([
      prisma.partnerClinicMeta.findUnique({
        where: { orgId_clientId: { orgId: ctx.org.id, clientId: id } },
      }),
      prisma.partnerClinicActivity.findMany({
        where: { orgId: ctx.org.id, clientId: id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.partnerTransaction.findMany({
        where: { orgId: ctx.org.id, clientId: id },
        orderBy: { transactionDate: 'desc' },
        take: 50,
        select: {
          id: true,
          transactionDate: true,
          description: true,
          revenueCents: true,
          refundedCents: true,
        },
      }),
    ])

    return successResponse({
      clinic,
      stage: meta?.stage ?? 'ACTIVE',
      tags: (meta?.tags as string[] | undefined) ?? [],
      activity,
      transactions,
    })
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    logger.error('Error loading clinic CRM', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to load clinic')
  }
}

const patchSchema = z.object({
  stage: z.enum(['LEAD', 'ACTIVE', 'AT_RISK', 'DORMANT']).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  note: z.string().trim().min(1).max(2000).optional(),
})

/**
 * PATCH /api/partners/clinics/[id] — update stage/tags and/or add a note.
 * Stage and tag changes are logged to the activity timeline automatically.
 */
export async function PATCH(request: NextRequest, context: Params) {
  try {
    const ctx = await requirePartner({ minRole: 'ADMIN' })
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')
    const { id } = await context.params

    const clinic = await resolveClinic(ctx, id)
    if (!clinic) return errorResponse('Clinic not found', 404, 'NOT_FOUND')

    const parsed = patchSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse('Invalid request', 400, 'VALIDATION_ERROR')
    const { stage, tags, note } = parsed.data
    if (!stage && !tags && !note) return errorResponse('Nothing to update', 400, 'EMPTY')

    const actorKind = ctx.kind
    const actorName =
      ctx.kind === 'REP' ? ctx.rep!.name : (ctx.member?.name ?? ctx.org.contactName ?? ctx.org.name)

    const existing = await prisma.partnerClinicMeta.findUnique({
      where: { orgId_clientId: { orgId: ctx.org.id, clientId: id } },
    })

    const activityCreates: Array<{ type: 'NOTE' | 'STAGE_CHANGE' | 'TAG_CHANGE'; body: string }> = []
    if (stage && stage !== (existing?.stage ?? 'ACTIVE')) {
      activityCreates.push({
        type: 'STAGE_CHANGE',
        body: `Stage changed ${existing?.stage ?? 'ACTIVE'} → ${stage}`,
      })
    }
    if (tags) {
      const before = ((existing?.tags as string[] | undefined) ?? []).join(', ') || '(none)'
      activityCreates.push({ type: 'TAG_CHANGE', body: `Tags set to: ${tags.join(', ') || '(none)'} (was ${before})` })
    }
    if (note) activityCreates.push({ type: 'NOTE', body: note })

    await prisma.$transaction([
      prisma.partnerClinicMeta.upsert({
        where: { orgId_clientId: { orgId: ctx.org.id, clientId: id } },
        update: { ...(stage ? { stage } : {}), ...(tags ? { tags } : {}) },
        create: { orgId: ctx.org.id, clientId: id, stage: stage ?? 'ACTIVE', tags: tags ?? [] },
      }),
      ...activityCreates.map((a) =>
        prisma!.partnerClinicActivity.create({
          data: {
            orgId: ctx.org.id,
            clientId: id,
            repId: ctx.kind === 'REP' ? ctx.rep!.id : null,
            actorKind,
            actorName,
            type: a.type,
            body: a.body,
          },
        })
      ),
    ])

    return successResponse({ success: true })
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    logger.error('Error updating clinic CRM', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to update clinic')
  }
}
