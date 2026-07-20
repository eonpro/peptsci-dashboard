import { NextRequest } from 'next/server'
import { z } from 'zod'
import { errorResponse, forbiddenResponse, successResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { requirePartner, PartnerForbiddenError } from '@/lib/partners/auth'
import { LEAD_PROTECTION_DAYS, normalizeLeadEmail, normalizeNpi } from '@/lib/partners/leads'

export const dynamic = 'force-dynamic'

/** GET /api/partners/leads — the caller's lead pipeline (reps see their own). */
export async function GET() {
  try {
    const ctx = await requirePartner()
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const leads = await prisma.partnerLead.findMany({
      where: {
        orgId: ctx.org.id,
        ...(ctx.kind === 'REP' ? { repId: ctx.rep!.id } : {}),
      },
      include: {
        rep: { select: { id: true, name: true } },
        matchedClient: { select: { id: true, organizationName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return successResponse({ leads, protectionDays: LEAD_PROTECTION_DAYS })
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    logger.error('Error listing leads', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to list leads')
  }
}

const createSchema = z.object({
  clinicName: z.string().trim().min(2).max(200),
  contactName: z.string().trim().max(200).optional().or(z.literal('')),
  email: z.string().trim().email().max(255).optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  npiNumber: z.string().trim().max(20).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
})

/**
 * POST /api/partners/leads — register a prospect. Starts the protection
 * window; requires at least an email or NPI so onboarding can actually match.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requirePartner({ minRole: 'ADMIN' })
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const parsed = createSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }
    const email = normalizeLeadEmail(parsed.data.email)
    const npiNumber = normalizeNpi(parsed.data.npiNumber)
    if (!email && !npiNumber) {
      return errorResponse(
        'Add the prospect\u2019s email or NPI — that\u2019s how we match them when they sign up.',
        400,
        'MATCH_KEY_REQUIRED'
      )
    }

    // One active protection per prospect across the whole program.
    const existing = await prisma.partnerLead.findFirst({
      where: {
        status: { in: ['NEW', 'WORKING'] },
        protectedUntil: { gte: new Date() },
        OR: [...(email ? [{ email }] : []), ...(npiNumber ? [{ npiNumber }] : [])],
      },
      select: { orgId: true },
    })
    if (existing) {
      return errorResponse(
        existing.orgId === ctx.org.id
          ? 'You already have an active lead for this prospect.'
          : 'This prospect is already protected by another partner.',
        409,
        'ALREADY_PROTECTED'
      )
    }

    // A clinic with this email may already be a customer — leads are for NEW business.
    if (email) {
      const alreadyClient = await prisma.client.findFirst({
        where: { contactEmail: { equals: email, mode: 'insensitive' } },
        select: { id: true },
      })
      if (alreadyClient) {
        return errorResponse('A clinic with this email is already a PeptSci customer.', 409, 'ALREADY_CUSTOMER')
      }
    }

    const lead = await prisma.partnerLead.create({
      data: {
        orgId: ctx.org.id,
        repId: ctx.kind === 'REP' ? ctx.rep!.id : null,
        clinicName: parsed.data.clinicName,
        contactName: parsed.data.contactName || null,
        email,
        phone: parsed.data.phone || null,
        npiNumber,
        notes: parsed.data.notes || null,
        protectedUntil: new Date(Date.now() + LEAD_PROTECTION_DAYS * 24 * 60 * 60 * 1000),
      },
    })
    logger.info('[PARTNER LEADS] Lead registered', { orgId: ctx.org.id, leadId: lead.id })
    return successResponse({ lead }, 201)
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    logger.error('Error registering lead', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to register lead')
  }
}

const patchSchema = z.object({
  leadId: z.string().trim().min(1),
  status: z.enum(['NEW', 'WORKING', 'LOST']).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
})

/** PATCH /api/partners/leads — update status/notes (CONVERTED/EXPIRED are system-set). */
export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requirePartner({ minRole: 'ADMIN' })
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const parsed = patchSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse('Invalid request', 400, 'VALIDATION_ERROR')
    const { leadId, ...data } = parsed.data

    const result = await prisma.partnerLead.updateMany({
      where: {
        id: leadId,
        orgId: ctx.org.id,
        ...(ctx.kind === 'REP' ? { repId: ctx.rep!.id } : {}),
        status: { in: ['NEW', 'WORKING', 'LOST'] },
      },
      data,
    })
    if (result.count === 0) return errorResponse('Lead not found or locked', 404, 'NOT_FOUND')
    return successResponse({ success: true })
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    logger.error('Error updating lead', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to update lead')
  }
}
