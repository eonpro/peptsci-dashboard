import Link from 'next/link'
import { Banknote, FileWarning, Hourglass } from 'lucide-react'
import { requirePartner } from '@/lib/partners/auth'
import { partnerCanMutate } from '@/lib/partners/portal'
import { prisma } from '@/lib/prisma'
import { commissionSummary } from '@/lib/partners/queries'
import { formatCents } from '@/lib/partners/commission'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { RequestPayoutButton } from './RequestPayoutButton'
import { StripeConnectCard } from './StripeConnectCard'
import { partnerStripePayoutsEnabled } from '@/lib/partners/stripe-payouts'
import { roleAtLeast } from '@/lib/partners/auth'
import { EmptyState } from '@/components/ui/empty-state'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageHeader } from '../_components/PageHeader'
import { StatCard } from '../_components/StatCard'

export const dynamic = 'force-dynamic'

export default async function PartnerPayoutsPage() {
  const ctx = await requirePartner()
  const canWrite = partnerCanMutate(ctx.kind, ctx.role)
  const w9OnFile = Boolean(ctx.org.w9BlobUrl)

  const [payouts, summary] = await Promise.all([
    prisma!.partnerPayout.findMany({
      where: {
        orgId: ctx.org.id,
        ...(ctx.kind === 'REP' ? { payee: 'REP', repId: ctx.rep!.id } : {}),
      },
      orderBy: { paidAt: 'desc' },
      include: { rep: { select: { name: true } } },
    }),
    commissionSummary({ orgId: ctx.org.id, ...(ctx.rep ? { repId: ctx.rep.id } : {}) }, ctx.kind),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payouts"
        description="Approved commission is paid out on the regular payout schedule."
        actions={
          <>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- CSV download route */}
            <a
              href="/partners/exports/payouts"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'bg-white text-slate-600')}
            >
              Export CSV
            </a>
            {canWrite ? <RequestPayoutButton /> : null}
          </>
        }
      />

      {!w9OnFile && canWrite && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="flex items-center gap-2">
            <FileWarning className="h-4 w-4 shrink-0" />
            Upload a W-9 under Program terms before we can pay you.
          </span>
          <Link href="/partners/terms" className="font-semibold underline">
            Upload W-9
          </Link>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard
          label="Unpaid balance"
          value={formatCents(summary.unpaidCents)}
          icon={Hourglass}
          tone="amber"
          sub="Accrued commission awaiting payout"
        />
        <StatCard
          label="Paid to date"
          value={formatCents(summary.paidCents)}
          icon={Banknote}
          tone="emerald"
          sub="Lifetime payouts received"
        />
      </div>

      {partnerStripePayoutsEnabled() && ctx.kind === 'ORG' && roleAtLeast(ctx.role, 'ADMIN') && (
        <StripeConnectCard
          connected={Boolean(ctx.org.stripeConnectAccountId)}
          payoutsEnabled={ctx.org.stripePayoutsEnabled}
        />
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              <TableHead className="text-xs uppercase tracking-wide">Date</TableHead>
              {ctx.kind === 'ORG' && (
                <TableHead className="text-xs uppercase tracking-wide">Payee</TableHead>
              )}
              <TableHead className="text-xs uppercase tracking-wide">Method</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Reference</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Notes</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payouts.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>
                  <EmptyState
                    icon={Banknote}
                    title="No payouts recorded yet"
                    description="Approved commission is paid out by the PeptSci team on the regular payout schedule."
                    className="py-6"
                  />
                </TableCell>
              </TableRow>
            )}
            {payouts.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="py-3">{p.paidAt.toLocaleDateString()}</TableCell>
                {ctx.kind === 'ORG' && (
                  <TableCell className="py-3">
                    {p.payee === 'ORG' ? 'Organization' : p.rep?.name || 'Rep'}
                  </TableCell>
                )}
                <TableCell className="py-3">{p.method || '—'}</TableCell>
                <TableCell className="py-3">{p.reference || '—'}</TableCell>
                <TableCell className="max-w-[240px] truncate py-3 text-slate-500">{p.notes || '—'}</TableCell>
                <TableCell className="py-3 text-right font-semibold tabular-nums">
                  {formatCents(p.amountCents)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </Card>
    </div>
  )
}
