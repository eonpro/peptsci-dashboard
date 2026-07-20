import { NextRequest } from 'next/server'
import { z } from 'zod'
import { errorResponse, forbiddenResponse, successResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { requirePartner, PartnerForbiddenError } from '@/lib/partners/auth'
import { approvedBalance } from '@/lib/partners/queries'
import { formatCents } from '@/lib/partners/commission'
import { notifyAdmins } from '@/lib/notifications/service'

export const dynamic = 'force-dynamic'

/** GET /api/partners/payout-requests — payout readiness + open/past requests. */
export async function GET() {
  try {
    const ctx = await requirePartner()
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const payee = ctx.kind === 'REP' ? ('REP' as const) : ('ORG' as const)
    const [balance, requests] = await Promise.all([
      approvedBalance(ctx.org.id, payee, ctx.rep?.id ?? null),
      prisma.partnerPayoutRequest.findMany({
        where: {
          orgId: ctx.org.id,
          ...(ctx.kind === 'REP' ? { payee: 'REP', repId: ctx.rep!.id } : { payee: 'ORG' }),
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ])

    return successResponse({
      approvedCents: balance.amountCents,
      minimumCents: ctx.org.payoutMinimumCents,
      w9OnFile: Boolean(ctx.org.w9BlobUrl),
      hasOpenRequest: requests.some((r) => r.status === 'PENDING'),
      requests,
    })
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    logger.error('Error loading payout requests', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to load payout requests')
  }
}

const createSchema = z.object({
  note: z.string().trim().max(500).optional().or(z.literal('')),
})

/**
 * POST /api/partners/payout-requests — request a payout of the caller's full
 * approved balance. Gated on the org's payout minimum and W-9 on file.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requirePartner({ minRole: 'ADMIN' })
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const parsed = createSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return errorResponse('Invalid request', 400, 'VALIDATION_ERROR')

    if (!ctx.org.w9BlobUrl) {
      return errorResponse(
        'Upload your W-9 on the Terms page before requesting a payout.',
        409,
        'W9_REQUIRED'
      )
    }

    const payee = ctx.kind === 'REP' ? ('REP' as const) : ('ORG' as const)
    const balance = await approvedBalance(ctx.org.id, payee, ctx.rep?.id ?? null)
    if (balance.amountCents < ctx.org.payoutMinimumCents) {
      return errorResponse(
        `Your approved balance (${formatCents(balance.amountCents)}) is below the ${formatCents(ctx.org.payoutMinimumCents)} payout minimum.`,
        409,
        'BELOW_MINIMUM'
      )
    }

    const open = await prisma.partnerPayoutRequest.findFirst({
      where: {
        orgId: ctx.org.id,
        payee,
        ...(ctx.kind === 'REP' ? { repId: ctx.rep!.id } : {}),
        status: 'PENDING',
      },
      select: { id: true },
    })
    if (open) return errorResponse('You already have an open payout request.', 409, 'ALREADY_REQUESTED')

    const req = await prisma.partnerPayoutRequest.create({
      data: {
        orgId: ctx.org.id,
        repId: ctx.kind === 'REP' ? ctx.rep!.id : null,
        payee,
        amountCents: balance.amountCents,
        note: parsed.data.note || null,
        requestedBy: ctx.userId,
      },
    })

    notifyAdmins({
      category: 'PAYMENT',
      priority: 'HIGH',
      title: `Payout requested — ${formatCents(balance.amountCents)}`,
      message: `${ctx.org.name}${ctx.rep ? ` (rep ${ctx.rep.name})` : ''} requested a payout of their approved balance.`,
      actionUrl: `/partners-admin/${ctx.org.id}`,
      sourceType: 'partner:payout-request',
      sourceId: req.id,
    }).catch(() => {})

    logger.info('[PARTNER PAYOUTS] Request created', { orgId: ctx.org.id, requestId: req.id })
    return successResponse({ request: req }, 201)
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    logger.error('Error creating payout request', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to request payout')
  }
}
