import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  requireAdmin,
  requireSuperAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { commissionSummary, revenueSummary } from '@/lib/partners/queries'
import { validateOrgRateBps } from '@/lib/partners/commission'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/**
 * GET /api/admin/partners/[id] — full org detail for the admin page: reps,
 * members, links, attributed clients, ledger summary, transactions, payouts.
 */
export async function GET(_request: NextRequest, context: Params) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await context.params
    const org = await prisma.partnerOrg.findUnique({
      where: { id },
      include: {
        reps: { orderBy: { createdAt: 'asc' } },
        members: { orderBy: { createdAt: 'asc' } },
        referralLinks: { orderBy: { createdAt: 'desc' } },
        clients: {
          select: {
            id: true,
            organizationName: true,
            contactEmail: true,
            onboardingStatus: true,
            partnerRepId: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        pricing: { include: { variant: { include: { product: { select: { name: true } } } } } },
        agreements: {
          select: {
            id: true,
            signerKind: true,
            signerName: true,
            documentVersion: true,
            signedAt: true,
            repId: true,
          },
          orderBy: { signedAt: 'desc' },
        },
        payouts: { orderBy: { paidAt: 'desc' }, take: 50 },
        leads: {
          include: {
            rep: { select: { name: true } },
            matchedClient: { select: { id: true, organizationName: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
        payoutRequests: {
          where: { status: 'PENDING' },
          orderBy: { createdAt: 'desc' },
        },
        referredByOrg: { select: { id: true, name: true } },
      },
    })
    if (!org) return errorResponse('Partner org not found', 404, 'NOT_FOUND')

    const [summary, revenue, pendingCount, approvedCount, transactions, grouped] =
      await Promise.all([
        commissionSummary({ orgId: id }, 'ORG'),
        revenueSummary({ orgId: id }),
        prisma.commissionEntry.count({ where: { orgId: id, status: 'PENDING' } }),
        prisma.commissionEntry.count({ where: { orgId: id, status: 'APPROVED' } }),
        prisma.partnerTransaction.findMany({
          where: { orgId: id },
          orderBy: { transactionDate: 'desc' },
          take: 100,
          include: {
            client: { select: { organizationName: true } },
            entries: true,
          },
        }),
        prisma.commissionEntry.groupBy({
          by: ['status', 'kind'],
          where: { orgId: id },
          _sum: { amountCents: true },
        }),
      ])

    // Org-wide (both payees) unpaid vs paid, net of reversals.
    let unpaidCents = 0
    let paidCents = 0
    for (const g of grouped) {
      const amount = (g._sum.amountCents ?? 0) * (g.kind === 'REVERSAL' ? -1 : 1)
      if (g.status === 'PAID') paidCents += amount
      else unpaidCents += amount
    }

    return successResponse({
      org,
      summary,
      revenue,
      totals: { unpaidCents, paidCents },
      pendingCount,
      approvedCount,
      transactions,
    })
  } catch (error) {
    logger.error(
      'Error loading partner org',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to load partner org')
  }
}

const patchSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  contactName: z.string().trim().max(200).nullable().optional(),
  contactPhone: z.string().trim().max(30).nullable().optional(),
  website: z.string().trim().max(255).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED']).optional(),
  compensationModel: z.enum(['COMMISSION', 'MARGIN']).optional(),
  commissionRateBps: z.number().int().optional(),
  // Payout policy (Wave 3)
  autoApproveEntries: z.boolean().optional(),
  holdDays: z.number().int().min(0).max(365).optional(),
  payoutMinimumCents: z.number().int().min(0).max(10_000_000).optional(),
  notifyByEmail: z.boolean().optional(),
})

/**
 * PATCH /api/admin/partners/[id] — update org settings (rate, model, status,
 * contact). Rate changes only affect FUTURE accruals (ledger rows are frozen).
 */
export async function PATCH(request: NextRequest, context: Params) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await context.params
    const parsed = patchSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }
    const data = parsed.data

    if (data.commissionRateBps !== undefined) {
      const err = validateOrgRateBps(data.commissionRateBps)
      if (err) return errorResponse(err, 400, 'RATE_INVALID')
      // Reps' carve-outs can never exceed the org rate — clamp any that would.
      await prisma.partnerRep.updateMany({
        where: { orgId: id, commissionRateBps: { gt: data.commissionRateBps } },
        data: { commissionRateBps: data.commissionRateBps },
      })
    }

    const org = await prisma.partnerOrg.update({ where: { id }, data })
    logger.info('[ADMIN PARTNERS] Org updated', { orgId: id, fields: Object.keys(data) })
    return successResponse({ org })
  } catch (error) {
    logger.error(
      'Error updating partner org',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to update partner org')
  }
}

/**
 * DELETE /api/admin/partners/[id] — permanently remove a partner org
 * (rejected applications, test orgs). SUPER_ADMIN only. Orgs with a
 * transaction/payout history are protected unless ?force=true — history
 * cascades away with the org, so force is for test data only. Attributed
 * clinics are detached (SetNull), never deleted.
 */
export async function DELETE(request: NextRequest, context: Params) {
  try {
    const { isAuthenticated, isSuperAdmin } = await requireSuperAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isSuperAdmin) return forbiddenResponse('Super Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await context.params
    const force = new URL(request.url).searchParams.get('force') === 'true'

    const org = await prisma.partnerOrg.findUnique({
      where: { id },
      include: { _count: { select: { transactions: true, payouts: true } } },
    })
    if (!org) return errorResponse('Partner org not found', 404, 'NOT_FOUND')
    if ((org._count.transactions > 0 || org._count.payouts > 0) && !force) {
      return errorResponse(
        'This org has ledger history. Suspend it instead, or pass ?force=true to delete anyway.',
        409,
        'HAS_HISTORY'
      )
    }

    await prisma.partnerOrg.delete({ where: { id } })
    logger.info('[ADMIN PARTNERS] Org deleted', { orgId: id, name: org.name, force })
    return successResponse({ success: true })
  } catch (error) {
    logger.error(
      'Error deleting partner org',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to delete partner org')
  }
}
