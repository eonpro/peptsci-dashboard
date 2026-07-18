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
import { Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
        <Button asChild className="font-semibold">
          <Link href="/partners/links">Create referral link</Link>
        </Button>
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
          <Link href="/partners/transactions" className="text-sm text-primary hover:underline">
            View all
          </Link>
        </div>
        {recent.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No transactions yet"
            description="Orders from your referred clinics appear here automatically."
            className="py-6"
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-auto py-2 pl-0 pr-4 text-xs uppercase">Date</TableHead>
                  <TableHead className="h-auto py-2 pl-0 pr-4 text-xs uppercase">Clinic</TableHead>
                  <TableHead className="h-auto py-2 pl-0 pr-4 text-right text-xs uppercase">Revenue</TableHead>
                  <TableHead className="h-auto py-2 pl-0 pr-0 text-right text-xs uppercase">Your commission</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
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
                    <TableRow key={txn.id}>
                      <TableCell className="py-2 pl-0 pr-4">{txn.transactionDate.toLocaleDateString()}</TableCell>
                      <TableCell className="py-2 pl-0 pr-4">{txn.client.organizationName}</TableCell>
                      <TableCell className="py-2 pl-0 pr-4 text-right">{formatCents(txn.revenueCents)}</TableCell>
                      <TableCell className="py-2 pl-0 pr-0 text-right font-medium">{formatCents(mine)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
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
