import { NextRequest } from 'next/server'
import { z } from 'zod'
import { errorResponse, forbiddenResponse, successResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { requirePartner, PartnerForbiddenError } from '@/lib/partners/auth'
import { msaDocument } from '@/lib/partners/msa'

export const dynamic = 'force-dynamic'

const signSchema = z.object({
  signerName: z.string().trim().min(2).max(200),
  signerTitle: z.string().trim().max(120).optional().or(z.literal('')),
  legalEntityName: z.string().trim().max(200).optional().or(z.literal('')),
  /** PNG data URL from the signature pad. Bounded to ~200KB. */
  signatureImage: z
    .string()
    .startsWith('data:image/png;base64,')
    .max(280_000, 'Signature image too large'),
})

/**
 * POST /api/partners/msa — execute the MSA for the current signer (org owner
 * or rep). Freezes the full document + signature as a PartnerAgreement and
 * stamps the signer's msaSignedAt (the portal gate).
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requirePartner()
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    // Only the org OWNER signs for the org; invited members ride on it.
    if (ctx.kind === 'ORG' && ctx.role !== 'OWNER') {
      return errorResponse('Only the account owner signs the agreement.', 403, 'OWNER_ONLY')
    }

    const alreadySigned = ctx.kind === 'ORG' ? ctx.org.msaSignedAt : ctx.rep?.msaSignedAt
    if (alreadySigned) return errorResponse('Agreement already signed.', 409, 'ALREADY_SIGNED')

    const parsed = signSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }
    const doc = msaDocument()
    const now = new Date()
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      null
    const userAgent = request.headers.get('user-agent')?.slice(0, 400) || null

    const signerEmail =
      ctx.kind === 'ORG' ? ctx.org.contactEmail : (ctx.rep?.email ?? null)

    await prisma.$transaction([
      prisma.partnerAgreement.create({
        data: {
          orgId: ctx.org.id,
          repId: ctx.kind === 'REP' ? ctx.rep!.id : null,
          signerKind: ctx.kind,
          clerkUserId: ctx.userId,
          documentVersion: doc.version,
          documentTitle: doc.title,
          documentHash: doc.hash,
          documentText: doc.text,
          legalEntityName: parsed.data.legalEntityName || (ctx.kind === 'ORG' ? ctx.org.name : null),
          signerName: parsed.data.signerName,
          signerTitle: parsed.data.signerTitle || null,
          signerEmail,
          signatureImage: parsed.data.signatureImage,
          signedIp: ip,
          signedUserAgent: userAgent,
          signedAt: now,
        },
      }),
      ctx.kind === 'ORG'
        ? prisma.partnerOrg.update({ where: { id: ctx.org.id }, data: { msaSignedAt: now } })
        : prisma.partnerRep.update({ where: { id: ctx.rep!.id }, data: { msaSignedAt: now } }),
    ])

    logger.info('[PARTNER MSA] Agreement executed', {
      orgId: ctx.org.id,
      signerKind: ctx.kind,
      version: doc.version,
    })
    return successResponse({ success: true, signedAt: now }, 201)
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    logger.error('Error signing MSA', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to sign agreement')
  }
}
