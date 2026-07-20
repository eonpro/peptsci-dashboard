import { NextRequest } from 'next/server'
import { z } from 'zod'
import { errorResponse, forbiddenResponse, successResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { requirePartner, PartnerForbiddenError } from '@/lib/partners/auth'
import { putObject } from '@/lib/storage'
import { MSA_VERSION } from '@/lib/partners/msa'
import { generateReferralCode } from '@/lib/partners/referral'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://peptsci.com').replace(/\/$/, '')

export const dynamic = 'force-dynamic'

/**
 * GET /api/partners/settings — program terms for the caller: comp model +
 * rates, tiers, payout policy, W-9 status, notification prefs.
 */
export async function GET() {
  try {
    const ctx = await requirePartner()
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const tiers = await prisma.partnerRateTier.findMany({
      where: { orgId: ctx.org.id },
      orderBy: { thresholdCents: 'asc' },
      select: { thresholdCents: true, bonusBps: true },
    })

    // Partner-refers-partner code, generated lazily for org sessions.
    let partnerRefCode = ctx.org.partnerRefCode
    if (!partnerRefCode && ctx.kind === 'ORG') {
      for (let attempt = 0; attempt < 3 && !partnerRefCode; attempt++) {
        try {
          const updated = await prisma.partnerOrg.update({
            where: { id: ctx.org.id },
            data: { partnerRefCode: generateReferralCode() },
            select: { partnerRefCode: true },
          })
          partnerRefCode = updated.partnerRefCode
        } catch (err) {
          if (attempt === 2) throw err
        }
      }
    }

    return successResponse({
      org: {
        name: ctx.org.name,
        compensationModel: ctx.org.compensationModel,
        commissionRateBps: ctx.org.commissionRateBps,
        holdDays: ctx.org.holdDays,
        autoApproveEntries: ctx.org.autoApproveEntries,
        payoutMinimumCents: ctx.org.payoutMinimumCents,
        w9OnFile: Boolean(ctx.org.w9BlobUrl),
        w9FileName: ctx.org.w9FileName,
        w9UploadedAt: ctx.org.w9UploadedAt,
        notifyByEmail: ctx.org.notifyByEmail,
        msaSignedAt: ctx.org.msaSignedAt,
      },
      rep: ctx.rep
        ? { name: ctx.rep.name, commissionRateBps: ctx.rep.commissionRateBps, msaSignedAt: ctx.rep.msaSignedAt }
        : null,
      role: ctx.role,
      kind: ctx.kind,
      tiers,
      msaVersion: MSA_VERSION,
      partnerReferralUrl: partnerRefCode
        ? `${APP_URL}/partners/apply?pref=${partnerRefCode}`
        : null,
    })
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    logger.error('Error loading settings', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to load settings')
  }
}

const patchSchema = z.object({
  notifyByEmail: z.boolean(),
})

/** PATCH /api/partners/settings — notification preferences (org ADMIN+). */
export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requirePartner({ orgOnly: true, minRole: 'ADMIN' })
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const parsed = patchSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse('Invalid request', 400, 'VALIDATION_ERROR')

    await prisma.partnerOrg.update({
      where: { id: ctx.org.id },
      data: { notifyByEmail: parsed.data.notifyByEmail },
    })
    return successResponse({ success: true })
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    logger.error('Error updating settings', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to update settings')
  }
}

const w9Schema = z.object({
  fileName: z.string().trim().min(1).max(200),
  contentType: z.enum(['application/pdf', 'image/png', 'image/jpeg']),
  /** Base64 file body, ~4MB max. */
  base64: z.string().min(100).max(6_000_000),
})

/** POST /api/partners/settings — upload the org's W-9 (org ADMIN+). */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requirePartner({ orgOnly: true, minRole: 'ADMIN' })
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const parsed = w9Schema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse('Upload a PDF/PNG/JPEG W-9 under 4MB', 400, 'VALIDATION_ERROR')
    }
    const buffer = Buffer.from(parsed.data.base64, 'base64')
    if (buffer.length > 4 * 1024 * 1024) {
      return errorResponse('File too large (4MB max)', 400, 'FILE_TOO_LARGE')
    }

    const stored = await putObject(
      `partner-w9/${ctx.org.id}/${Date.now()}-${parsed.data.fileName}`,
      buffer,
      parsed.data.contentType
    )
    if (stored.driver !== 'blob' || !stored.url) {
      // Tax documents must not live inline in a DB row.
      return errorResponse('Document storage is unavailable — try again shortly.', 503, 'STORAGE_UNAVAILABLE')
    }

    await prisma.partnerOrg.update({
      where: { id: ctx.org.id },
      data: {
        w9BlobUrl: stored.url,
        w9FileName: parsed.data.fileName,
        w9UploadedAt: new Date(),
      },
    })
    logger.info('[PARTNER SETTINGS] W-9 uploaded', { orgId: ctx.org.id })
    return successResponse({ success: true }, 201)
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    logger.error('Error uploading W-9', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to upload W-9')
  }
}
