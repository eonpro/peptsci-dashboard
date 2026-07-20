import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPartnerContext } from '@/lib/partners/auth'
import { clinicBook, monthlyStatements } from '@/lib/partners/queries'

export const dynamic = 'force-dynamic'

function csvEscape(value: unknown): string {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n')
}

const usd = (cents: number) => (cents / 100).toFixed(2)

/**
 * GET /partners/exports/[dataset] — CSV downloads for the partner portal.
 * Datasets: transactions | clinics | payouts. Scoped to the caller (org-wide
 * for org sessions, own book for reps).
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ dataset: string }> }
) {
  const ctx = await getPartnerContext()
  if (!ctx || !prisma) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { dataset } = await context.params
  const repScope = ctx.kind === 'REP' ? { repId: ctx.rep!.id } : {}

  let csv: string
  if (dataset === 'transactions') {
    const txns = await prisma.partnerTransaction.findMany({
      where: { orgId: ctx.org.id, ...repScope },
      orderBy: { transactionDate: 'desc' },
      include: {
        client: { select: { organizationName: true } },
        entries: { select: { payee: true, kind: true, amountCents: true, repId: true, status: true } },
      },
    })
    csv = toCsv(
      ['date', 'clinic', 'description', 'reference', 'revenue', 'refunded', 'commission', 'status'],
      txns.map((t) => {
        const mine = t.entries.filter((e) =>
          ctx.kind === 'ORG' ? e.payee === 'ORG' : e.payee === 'REP' && e.repId === ctx.rep!.id
        )
        const commission = mine.reduce(
          (sum, e) => sum + (e.kind === 'REVERSAL' ? -e.amountCents : e.amountCents),
          0
        )
        const status = mine.some((e) => e.status === 'PAID')
          ? 'paid'
          : mine.some((e) => e.status === 'APPROVED')
            ? 'approved'
            : 'pending'
        return [
          t.transactionDate.toISOString().slice(0, 10),
          t.client?.organizationName ?? 'Program bonus',
          t.description ?? '',
          t.reference ?? '',
          usd(t.revenueCents),
          usd(t.refundedCents),
          usd(commission),
          status,
        ]
      })
    )
  } else if (dataset === 'clinics') {
    const rows = await clinicBook({ orgId: ctx.org.id, ...repScope }, ctx.kind)
    csv = toCsv(
      ['clinic', 'contact', 'stage', 'rep', 'since', 'last_order', 'revenue', 'commission'],
      rows.map((r) => [
        r.organizationName,
        r.contactName ?? '',
        r.stage,
        r.repName ?? '',
        r.createdAt.toISOString().slice(0, 10),
        r.lastOrderAt ? r.lastOrderAt.toISOString().slice(0, 10) : '',
        usd(r.revenueCents),
        usd(r.commissionCents),
      ])
    )
  } else if (dataset === 'payouts') {
    const payouts = await prisma.partnerPayout.findMany({
      where: {
        orgId: ctx.org.id,
        ...(ctx.kind === 'REP' ? { payee: 'REP', repId: ctx.rep!.id } : {}),
      },
      orderBy: { paidAt: 'desc' },
      include: { rep: { select: { name: true } } },
    })
    csv = toCsv(
      ['date', 'payee', 'method', 'reference', 'notes', 'amount'],
      payouts.map((p) => [
        p.paidAt.toISOString().slice(0, 10),
        p.payee === 'ORG' ? 'organization' : p.rep?.name || 'rep',
        p.method ?? '',
        p.reference ?? '',
        p.notes ?? '',
        usd(p.amountCents),
      ])
    )
  } else if (dataset === 'statements') {
    const rows = await monthlyStatements({ orgId: ctx.org.id, ...repScope }, ctx.kind, 24)
    csv = toCsv(
      ['month', 'earned', 'reversed', 'paid_out', 'closing_balance'],
      rows.map((r) => [
        r.month,
        usd(r.earnedCents),
        usd(r.reversedCents),
        usd(r.paidCents),
        usd(r.closingUnpaidCents),
      ])
    )
  } else {
    return NextResponse.json({ error: 'Unknown dataset' }, { status: 404 })
  }

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="partner-${dataset}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
