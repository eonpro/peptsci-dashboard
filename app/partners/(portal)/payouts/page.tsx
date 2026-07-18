import { Banknote } from 'lucide-react'
import { requirePartner } from '@/lib/partners/auth'
import { prisma } from '@/lib/prisma'
import { commissionSummary } from '@/lib/partners/queries'
import { formatCents } from '@/lib/partners/commission'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export const dynamic = 'force-dynamic'

export default async function PartnerPayoutsPage() {
  const ctx = await requirePartner()

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
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Payouts</h1>
          <p className="text-sm text-slate-500">
            Unpaid balance: <strong className="text-amber-600">{formatCents(summary.unpaidCents)}</strong> ·
            Paid to date: <strong className="text-emerald-600">{formatCents(summary.paidCents)}</strong>
          </p>
        </div>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- CSV download route */}
        <a
          href="/partners/exports/payouts"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'bg-white text-slate-600')}
        >
          Export CSV
        </a>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
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
                <TableCell className="py-3 text-right font-medium">{formatCents(p.amountCents)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
