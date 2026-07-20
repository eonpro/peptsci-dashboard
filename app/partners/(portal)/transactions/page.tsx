import { Receipt } from 'lucide-react'
import { requirePartner } from '@/lib/partners/auth'
import { prisma } from '@/lib/prisma'
import { formatCents } from '@/lib/partners/commission'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
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

export default async function PartnerTransactionsPage() {
  const ctx = await requirePartner()
  const transactions = await prisma!.partnerTransaction.findMany({
    where: { orgId: ctx.org.id, ...(ctx.rep ? { repId: ctx.rep.id } : {}) },
    orderBy: { transactionDate: 'desc' },
    take: 250,
    include: {
      client: { select: { organizationName: true } },
      entries: {
        select: { payee: true, kind: true, amountCents: true, repId: true, status: true },
      },
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Transactions</h1>
          <p className="text-sm text-slate-500">
            Every attributed revenue event and your commission on it (net of refunds).
          </p>
        </div>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- CSV download route */}
        <a
          href="/partners/exports/transactions"
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
              <TableHead className="text-xs uppercase tracking-wide">Clinic</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Description</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide">Revenue</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide">Refunded</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide">Your commission</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>
                  <EmptyState icon={Receipt} title="No transactions yet." className="py-6" />
                </TableCell>
              </TableRow>
            )}
            {transactions.map((txn) => {
              const mineEntries = txn.entries.filter((entry) =>
                ctx.kind === 'ORG'
                  ? entry.payee === 'ORG'
                  : entry.payee === 'REP' && entry.repId === ctx.rep!.id
              )
              const mine = mineEntries.reduce(
                (sum, e) => sum + (e.kind === 'REVERSAL' ? -e.amountCents : e.amountCents),
                0
              )
              const paid = mineEntries.some((e) => e.status === 'PAID')
              const status = paid ? 'Paid' : mineEntries.some((e) => e.status === 'APPROVED') ? 'Approved' : 'Pending'
              return (
                <TableRow key={txn.id}>
                  <TableCell className="py-3">{txn.transactionDate.toLocaleDateString()}</TableCell>
                  <TableCell className="py-3">{txn.client?.organizationName ?? 'Program bonus'}</TableCell>
                  <TableCell className="max-w-[280px] truncate py-3 text-slate-500">
                    {txn.description || txn.reference || '—'}
                  </TableCell>
                  <TableCell className="py-3 text-right">{formatCents(txn.revenueCents)}</TableCell>
                  <TableCell className="py-3 text-right text-red-600">
                    {txn.refundedCents > 0 ? `−${formatCents(txn.refundedCents)}` : '—'}
                  </TableCell>
                  <TableCell className="py-3 text-right font-medium">{formatCents(mine)}</TableCell>
                  <TableCell className="py-3">
                    <Badge
                      variant="outline"
                      className={cn(
                        'font-medium',
                        status === 'Paid'
                          ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                          : status === 'Approved'
                            ? 'border-blue-200 bg-blue-100 text-blue-700'
                            : 'border-amber-200 bg-amber-100 text-amber-700'
                      )}
                    >
                      {status}
                    </Badge>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
