import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { authenticatePartnerApiKey } from '@/lib/partners/api-auth'
import { commissionSummary, revenueSummary, clinicBook } from '@/lib/partners/queries'
import { referralUrl } from '@/lib/partners/referral'

export const dynamic = 'force-dynamic'

const usd = (cents: number) => Number((cents / 100).toFixed(2))

/**
 * GET /api/partner/v1/[resource] — read-only partner API, authenticated with
 * `Authorization: Bearer pk_live_….…` keys (org scope).
 *
 * Resources: summary | transactions | payouts | clinics | links
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ resource: string }> }
) {
  if (!prisma) {
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 })
  }

  const auth = await authenticatePartnerApiKey(request.headers.get('authorization'))
  if (!auth) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const rl = await checkRateLimit(`partner-api:${auth.keyId}`, RATE_LIMITS.standard)
  if (rl.limited) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const { resource } = await context.params
  const orgId = auth.org.id

  switch (resource) {
    case 'summary': {
      const [summary, revenue] = await Promise.all([
        commissionSummary({ orgId }, 'ORG'),
        revenueSummary({ orgId }),
      ])
      return NextResponse.json({
        org: { id: orgId, name: auth.org.name, compensationModel: auth.org.compensationModel },
        revenue: usd(revenue.revenueCents),
        refunded: usd(revenue.refundedCents),
        clinicCount: revenue.clinicCount,
        transactionCount: revenue.transactionCount,
        commission: {
          earned: usd(summary.ownCents),
          repCarveOuts: usd(summary.repCents),
          unpaid: usd(summary.unpaidCents),
          paid: usd(summary.paidCents),
        },
      })
    }

    case 'transactions': {
      const txns = await prisma.partnerTransaction.findMany({
        where: { orgId },
        orderBy: { transactionDate: 'desc' },
        take: 500,
        include: {
          client: { select: { id: true, organizationName: true } },
          entries: { select: { payee: true, kind: true, amountCents: true, status: true } },
        },
      })
      return NextResponse.json({
        transactions: txns.map((t) => ({
          id: t.id,
          date: t.transactionDate.toISOString(),
          clinic: t.client ? { id: t.client.id, name: t.client.organizationName } : null,
          description: t.description,
          reference: t.reference,
          revenue: usd(t.revenueCents),
          refunded: usd(t.refundedCents),
          source: t.source,
          commission: usd(
            t.entries.reduce(
              (sum, e) => sum + (e.kind === 'REVERSAL' ? -e.amountCents : e.amountCents),
              0
            )
          ),
        })),
      })
    }

    case 'payouts': {
      const payouts = await prisma.partnerPayout.findMany({
        where: { orgId },
        orderBy: { paidAt: 'desc' },
        take: 500,
        include: { rep: { select: { id: true, name: true } } },
      })
      return NextResponse.json({
        payouts: payouts.map((p) => ({
          id: p.id,
          date: p.paidAt.toISOString(),
          payee: p.payee,
          rep: p.rep ? { id: p.rep.id, name: p.rep.name } : null,
          amount: usd(p.amountCents),
          method: p.method,
          reference: p.reference,
        })),
      })
    }

    case 'clinics': {
      const rows = await clinicBook({ orgId }, 'ORG')
      return NextResponse.json({
        clinics: rows.map((r) => ({
          id: r.clientId,
          name: r.organizationName,
          stage: r.stage,
          rep: r.repName,
          since: r.createdAt.toISOString(),
          lastOrderAt: r.lastOrderAt?.toISOString() ?? null,
          revenue: usd(r.revenueCents),
          commission: usd(r.commissionCents),
        })),
      })
    }

    case 'links': {
      const links = await prisma.referralLink.findMany({
        where: { orgId },
        orderBy: { createdAt: 'desc' },
        include: { rep: { select: { id: true, name: true } } },
      })
      return NextResponse.json({
        links: links.map((l) => ({
          id: l.id,
          code: l.code,
          url: referralUrl(l.code),
          label: l.label,
          active: l.active,
          clicks: l.clickCount,
          signups: l.signupCount,
          rep: l.rep ? { id: l.rep.id, name: l.rep.name } : null,
        })),
      })
    }

    default:
      return NextResponse.json(
        { error: 'unknown_resource', resources: ['summary', 'transactions', 'payouts', 'clinics', 'links'] },
        { status: 404 }
      )
  }
}
