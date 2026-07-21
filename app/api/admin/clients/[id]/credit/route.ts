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
import { creditBalanceCents, clinicReferralUrl } from '@/lib/referrals/credit'
import { dollarsToCents } from '@/lib/partners/commission'
import { writeAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/**
 * GET /api/admin/clients/[id]/credit — the clinic's referral-credit position:
 * balance, ledger history, referral link, who referred them, who they referred.
 */
export async function GET(_request: NextRequest, context: Params) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await context.params
    const client = await prisma.client.findUnique({
      where: { id },
      select: {
        referralCode: true,
        referredBy: { select: { id: true, organizationName: true } },
        referredClinics: { select: { id: true, organizationName: true, createdAt: true } },
      },
    })
    if (!client) return errorResponse('Client not found', 404, 'NOT_FOUND')

    const [balance, entries] = await Promise.all([
      creditBalanceCents(id),
      prisma.clientCreditEntry.findMany({
        where: { clientId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { sourceClient: { select: { organizationName: true } } },
      }),
    ])

    return successResponse({
      balanceCents: balance,
      referralUrl: client.referralCode ? clinicReferralUrl(client.referralCode) : null,
      referredBy: client.referredBy,
      referredClinics: client.referredClinics,
      entries,
    })
  } catch (error) {
    logger.error('Error loading client credit', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to load client credit')
  }
}

const adjustSchema = z.object({
  /** Signed dollars: positive grants credit, negative removes it. */
  amount: z
    .number()
    .refine((v) => v !== 0, 'Amount cannot be zero')
    .refine((v) => Math.abs(v) <= 100_000, 'Amount too large'),
  note: z.string().trim().min(2, 'A note is required for adjustments').max(500),
})

/**
 * POST /api/admin/clients/[id]/credit — manual credit adjustment (grant or
 * remove), always with an audit note. Negative adjustments may not push the
 * balance below zero.
 */
export async function POST(request: NextRequest, context: Params) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin || !userId) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await context.params
    const parsed = adjustSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }
    const amountCents = dollarsToCents(parsed.data.amount)

    if (amountCents < 0) {
      const balance = await creditBalanceCents(id)
      if (balance + amountCents < 0) {
        return errorResponse(
          `Removal exceeds the current balance ($${(balance / 100).toFixed(2)}).`,
          400,
          'INSUFFICIENT_BALANCE'
        )
      }
    }

    const entry = await prisma.clientCreditEntry.create({
      data: {
        clientId: id,
        amountCents,
        kind: 'ADJUSTMENT',
        note: parsed.data.note,
        createdBy: userId,
      },
    })
    logger.info('[ADMIN CREDIT] Adjustment recorded', { clientId: id, amountCents, by: userId })
    void writeAudit({
      clerkUserId: userId,
      entity: 'Client',
      entityId: id,
      action: 'credit_adjusted',
      metadata: { amountCents, note: parsed.data.note, entryId: entry.id },
    })
    return successResponse({ entry, balanceCents: await creditBalanceCents(id) }, 201)
  } catch (error) {
    logger.error('Error adjusting client credit', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to adjust credit')
  }
}
