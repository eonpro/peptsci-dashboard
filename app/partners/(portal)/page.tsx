import Link from 'next/link'
import { requirePartner } from '@/lib/partners/auth'
import { prisma } from '@/lib/prisma'
import {
  commissionSummary,
  revenueSummary,
  monthlyTrend,
  type LedgerScope,
} from '@/lib/partners/queries'
import { formatCents, formatBps } from '@/lib/partners/commission'
import { TrendChart } from './TrendChart'

export const dynamic = 'force-dynamic'

export default async function PartnerDashboardPage() {
  const ctx = await requirePartner()
  const viewer = ctx.kind
  const scope: LedgerScope = { orgId: ctx.org.id, ...(ctx.rep ? { repId: ctx.rep.id } : {}) }

  const [summary, revenue, trend, recent] = await Promise.all([
    commissionSummary(scope, viewer),
    revenueSummary(scope),
    monthlyTrend(scope, viewer, 12),
    prisma!.partnerTransaction.findMany({
      where: { orgId: ctx.org.id, ...(ctx.rep ? { repId: ctx.rep.id } : {}) },
      orderBy: { transactionDate: 'desc' },
      take: 8,
      include: {
        client: { select: { organizationName: true } },
        entries: { select: { payee: true, kind: true, amountCents: true, repId: true } },
      },
    }),
  ])

  const rateLabel =
    ctx.org.compensationModel === 'MARGIN'
      ? ctx.kind === 'REP'
        ? `${formatBps(ctx.rep!.commissionRateBps)} of margin`
        : 'Margin model'
      : ctx.kind === 'REP'
        ? formatBps(ctx.rep!.commissionRateBps)
        : formatBps(ctx.org.commissionRateBps)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {ctx.kind === 'REP' ? `Welcome, ${ctx.rep!.name.split(' ')[0]}` : ctx.org.name}
          </h1>
          <p className="text-sm text-slate-500">
            Your rate: <strong>{rateLabel}</strong> · {revenue.clinicCount} clinic
            {revenue.clinicCount === 1 ? '' : 's'} · {revenue.transactionCount} transaction
            {revenue.transactionCount === 1 ? '' : 's'}
          </p>
        </div>
        <Link
          href="/partners/links"
          className="rounded-lg bg-[#213cef] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1a30c4]"
        >
          Create referral link
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Attributed revenue" value={formatCents(revenue.revenueCents)} />
        <Kpi label={ctx.kind === 'REP' ? 'Your commission' : 'Org commission'} value={formatCents(summary.ownCents)} />
        <Kpi label="Unpaid balance" value={formatCents(summary.unpaidCents)} tone="amber" />
        <Kpi label="Paid out" value={formatCents(summary.paidCents)} tone="emerald" />
      </div>

      {ctx.kind === 'ORG' && summary.repCents > 0 && (
        <p className="text-xs text-slate-500">
          Rep carve-outs to date: <strong>{formatCents(summary.repCents)}</strong> (paid out of the
          org commission above).
        </p>
      )}

      <div className="rounded-xl border bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Last 12 months
        </h2>
        <TrendChart
          data={trend.map((p) => ({
            month: p.month,
            revenue: p.revenueCents / 100,
            commission: p.commissionCents / 100,
          }))}
        />
      </div>

      <div className="rounded-xl border bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Recent transactions
          </h2>
          <Link href="/partners/transactions" className="text-sm text-[#213cef] hover:underline">
            View all
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            No transactions yet — orders from your referred clinics appear here automatically.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-slate-400">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Clinic</th>
                <th className="py-2 pr-4 text-right">Revenue</th>
                <th className="py-2 text-right">Your commission</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((txn) => {
                const mine = txn.entries.reduce((sum, entry) => {
                  const isMine =
                    viewer === 'ORG'
                      ? entry.payee === 'ORG'
                      : entry.payee === 'REP' && entry.repId === ctx.rep!.id
                  if (!isMine) return sum
                  return sum + (entry.kind === 'REVERSAL' ? -entry.amountCents : entry.amountCents)
                }, 0)
                return (
                  <tr key={txn.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">{txn.transactionDate.toLocaleDateString()}</td>
                    <td className="py-2 pr-4">{txn.client.organizationName}</td>
                    <td className="py-2 pr-4 text-right">{formatCents(txn.revenueCents)}</td>
                    <td className="py-2 text-right font-medium">{formatCents(mine)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'amber' | 'emerald' }) {
  const toneClass =
    tone === 'amber' ? 'text-amber-600' : tone === 'emerald' ? 'text-emerald-600' : 'text-slate-900'
  return (
    <div className="rounded-xl border bg-white p-5">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  )
}
