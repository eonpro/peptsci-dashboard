import Link from 'next/link'
import { requirePartner } from '@/lib/partners/auth'
import { prisma } from '@/lib/prisma'
import {
  commissionSummary,
  revenueSummary,
  monthlyTrend,
  acquisitionFunnel,
  orgLeaderboard,
  type LedgerScope,
} from '@/lib/partners/queries'
import { formatCents, formatBps } from '@/lib/partners/commission'
import {
  ArrowRight,
  Banknote,
  ChevronRight,
  HandCoins,
  Hourglass,
  Link2,
  Receipt,
  Share2,
  TrendingUp,
  Trophy,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageHeader } from './_components/PageHeader'
import { StatCard } from './_components/StatCard'
import { TrendChart } from './TrendChart'

export const dynamic = 'force-dynamic'

export default async function PartnerDashboardPage() {
  const ctx = await requirePartner()
  const viewer = ctx.kind
  const scope: LedgerScope = { orgId: ctx.org.id, ...(ctx.rep ? { repId: ctx.rep.id } : {}) }

  const [summary, revenue, trend, funnel, leaderboard, recent] = await Promise.all([
    commissionSummary(scope, viewer),
    revenueSummary(scope),
    monthlyTrend(scope, viewer, 12),
    acquisitionFunnel(scope),
    ctx.kind === 'ORG' ? orgLeaderboard(ctx.org.id) : Promise.resolve([]),
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

  const firstRun = funnel.clicks === 0 && revenue.transactionCount === 0

  return (
    <div className="space-y-6">
      <PageHeader
        title={ctx.kind === 'REP' ? `Welcome, ${ctx.rep!.name.split(' ')[0]}` : ctx.org.name}
        description={
          <>
            Your rate: <strong>{rateLabel}</strong> · {revenue.clinicCount} clinic
            {revenue.clinicCount === 1 ? '' : 's'} · {revenue.transactionCount} transaction
            {revenue.transactionCount === 1 ? '' : 's'}
          </>
        }
        actions={
          <Button asChild className="font-semibold">
            <Link href="/partners/links">Create referral link</Link>
          </Button>
        }
      />

      {firstRun && <GetStartedCard />}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Attributed revenue" value={formatCents(revenue.revenueCents)} icon={TrendingUp} />
        <StatCard
          label={ctx.kind === 'REP' ? 'Your commission' : 'Org commission'}
          value={formatCents(summary.ownCents)}
          icon={HandCoins}
        />
        <StatCard label="Unpaid balance" value={formatCents(summary.unpaidCents)} icon={Hourglass} tone="amber" />
        <StatCard label="Paid out" value={formatCents(summary.paidCents)} icon={Banknote} tone="emerald" />
      </div>

      {ctx.kind === 'ORG' && summary.repCents > 0 && (
        <p className="text-xs text-slate-500">
          Rep carve-outs to date: <strong>{formatCents(summary.repCents)}</strong> (paid out of the
          org commission above).
        </p>
      )}

      {/* Acquisition funnel */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Your acquisition funnel
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Funnel funnel={funnel} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Last 12 months
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TrendChart
            data={trend.map((p) => ({
              month: p.month,
              revenue: p.revenueCents / 100,
              commission: p.commissionCents / 100,
            }))}
          />
        </CardContent>
      </Card>

      {/* Quarterly leaderboard (org sessions) */}
      {leaderboard.length > 1 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <Trophy className="h-4 w-4 text-amber-500" />
              Quarterly leaderboard
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-1.5">
              {leaderboard.map((row) => (
                <li
                  key={row.rank}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                    row.isYou
                      ? 'bg-brand-primary/10 font-semibold text-brand-primary ring-1 ring-brand-primary/20'
                      : 'text-slate-600'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <RankBadge rank={row.rank} />
                    {row.label}
                  </span>
                  <span className="tabular-nums">{formatCents(row.revenueCents)}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-slate-400">
              Quarter-to-date attributed revenue across all partners (anonymized).
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Recent transactions
          </CardTitle>
          <Link
            href="/partners/transactions"
            className="flex items-center gap-1 text-sm font-medium text-brand-primary hover:underline"
          >
            View all
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardHeader>
        <CardContent>
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
                  <TableRow className="hover:bg-transparent">
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
                        <TableCell className="py-2.5 pl-0 pr-4 text-slate-500">
                          {txn.transactionDate.toLocaleDateString()}
                        </TableCell>
                        <TableCell className="py-2.5 pl-0 pr-4 font-medium text-slate-900">
                          {txn.client?.organizationName ?? 'Program bonus'}
                        </TableCell>
                        <TableCell className="py-2.5 pl-0 pr-4 text-right tabular-nums">
                          {formatCents(txn.revenueCents)}
                        </TableCell>
                        <TableCell className="py-2.5 pl-0 pr-0 text-right font-semibold tabular-nums text-slate-900">
                          {formatCents(mine)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function GetStartedCard() {
  const steps = [
    {
      icon: Link2,
      title: 'Create a referral link',
      body: 'Generate a trackable link (with QR code) for your outreach.',
    },
    {
      icon: Share2,
      title: 'Share it with clinics',
      body: 'Send it to clinics you work with — clicks and signups are attributed to you.',
    },
    {
      icon: TrendingUp,
      title: 'Track your earnings',
      body: 'Watch orders roll in here; commissions accrue automatically.',
    },
  ]
  return (
    <Card className="border-brand-primary/20 bg-gradient-to-br from-brand-primary/[0.06] to-transparent">
      <CardContent className="p-6">
        <h2 className="text-base font-bold text-slate-900">Get started in three steps</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          You haven&rsquo;t had any activity yet — here&rsquo;s the fastest path to your first commission.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {steps.map((step, i) => (
            <div key={step.title} className="flex gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                <step.icon className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {i + 1}. {step.title}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
        <Button asChild size="sm" className="mt-5 font-semibold">
          <Link href="/partners/links">
            Create your first link
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function Funnel({
  funnel,
}: {
  funnel: {
    clicks: number
    signups: number
    approvedClinics: number
    orderingClinics: number
    revenueCents: number
  }
}) {
  const counts = [funnel.clicks, funnel.signups, funnel.approvedClinics, funnel.orderingClinics]
  const steps: Array<[string, string]> = [
    ['Link clicks', funnel.clicks.toLocaleString()],
    ['Signups', funnel.signups.toLocaleString()],
    ['Approved clinics', funnel.approvedClinics.toLocaleString()],
    ['Ordering clinics', funnel.orderingClinics.toLocaleString()],
    ['Attributed revenue', formatCents(funnel.revenueCents)],
  ]
  // Step-to-step conversion hints (only when the previous step has volume).
  const conversion = (i: number): string | null => {
    if (i === 0 || i > 3) return null
    const prev = counts[i - 1]
    if (!prev) return null
    return `${Math.round((counts[i] / prev) * 100)}%`
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {steps.map(([label, value], i) => {
        const rate = conversion(i)
        return (
          <div key={label} className="relative rounded-xl border border-slate-100 bg-slate-50 p-3.5 text-center">
            <p className="text-lg font-bold tracking-tight text-slate-900">{value}</p>
            <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
            {rate && (
              <p className="mt-1 text-[10px] font-semibold text-brand-primary">{rate} convert</p>
            )}
            {i < steps.length - 1 && (
              <ChevronRight className="absolute -right-2.5 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-slate-300 sm:block" />
            )}
          </div>
        )
      })}
    </div>
  )
}

function RankBadge({ rank }: { rank: number }) {
  const medal =
    rank === 1
      ? 'bg-amber-100 text-amber-700'
      : rank === 2
        ? 'bg-slate-200 text-slate-600'
        : rank === 3
          ? 'bg-orange-100 text-orange-700'
          : 'bg-slate-100 text-slate-500'
  return (
    <span
      className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${medal}`}
    >
      {rank}
    </span>
  )
}
