import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/partners/payout-queue — every payable balance across the
 * program in one view: net APPROVED amounts per payee, W-9 status, and open
 * payout requests. Powers the admin "Payout queue" section.
 */
export async function GET() {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const [grouped, orgs, reps, requests] = await Promise.all([
      prisma.commissionEntry.groupBy({
        by: ['orgId', 'payee', 'repId', 'kind'],
        where: { status: 'APPROVED' },
        _sum: { amountCents: true },
      }),
      prisma.partnerOrg.findMany({
        select: { id: true, name: true, w9BlobUrl: true, payoutMinimumCents: true },
      }),
      prisma.partnerRep.findMany({ select: { id: true, name: true } }),
      prisma.partnerPayoutRequest.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        include: {
          org: { select: { name: true } },
          rep: { select: { name: true } },
        },
      }),
    ])

    const orgById = new Map(orgs.map((o) => [o.id, o]))
    const repById = new Map(reps.map((r) => [r.id, r]))

    // Net APPROVED balance per (org, payee, rep).
    const balances = new Map<
      string,
      { orgId: string; payee: 'ORG' | 'REP'; repId: string | null; amountCents: number }
    >()
    for (const g of grouped) {
      const key = `${g.orgId}:${g.payee}:${g.repId ?? ''}`
      const row =
        balances.get(key) ??
        ({ orgId: g.orgId, payee: g.payee, repId: g.repId, amountCents: 0 } as const)
      const next = { ...row }
      next.amountCents += (g._sum.amountCents ?? 0) * (g.kind === 'REVERSAL' ? -1 : 1)
      balances.set(key, next)
    }

    const queue = [...balances.values()]
      .filter((b) => b.amountCents > 0)
      .map((b) => {
        const org = orgById.get(b.orgId)
        return {
          orgId: b.orgId,
          orgName: org?.name ?? 'Unknown org',
          payee: b.payee,
          repId: b.repId,
          repName: b.repId ? (repById.get(b.repId)?.name ?? 'Rep') : null,
          amountCents: b.amountCents,
          w9OnFile: Boolean(org?.w9BlobUrl),
          minimumCents: org?.payoutMinimumCents ?? 0,
          hasOpenRequest: requests.some(
            (r) => r.orgId === b.orgId && r.payee === b.payee && (r.repId ?? null) === b.repId
          ),
        }
      })
      .sort((a, b) => b.amountCents - a.amountCents)

    return successResponse({
      queue,
      requests: requests.map((r) => ({
        id: r.id,
        orgId: r.orgId,
        orgName: r.org.name,
        payee: r.payee,
        repName: r.rep?.name ?? null,
        amountCents: r.amountCents,
        note: r.note,
        createdAt: r.createdAt,
      })),
    })
  } catch (error) {
    logger.error('Error loading payout queue', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to load payout queue')
  }
}
