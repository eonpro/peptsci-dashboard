import { requirePartner } from '@/lib/partners/auth'
import { prisma } from '@/lib/prisma'
import { formatCents } from '@/lib/partners/commission'

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
          className="rounded-lg border px-3 py-1.5 text-sm text-slate-600 hover:bg-white"
        >
          Export CSV
        </a>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Clinic</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3 text-right">Revenue</th>
              <th className="px-4 py-3 text-right">Refunded</th>
              <th className="px-4 py-3 text-right">Your commission</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  No transactions yet.
                </td>
              </tr>
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
                <tr key={txn.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">{txn.transactionDate.toLocaleDateString()}</td>
                  <td className="px-4 py-3">{txn.client.organizationName}</td>
                  <td className="max-w-[280px] truncate px-4 py-3 text-slate-500">
                    {txn.description || txn.reference || '—'}
                  </td>
                  <td className="px-4 py-3 text-right">{formatCents(txn.revenueCents)}</td>
                  <td className="px-4 py-3 text-right text-red-600">
                    {txn.refundedCents > 0 ? `−${formatCents(txn.refundedCents)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{formatCents(mine)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        status === 'Paid'
                          ? 'bg-emerald-100 text-emerald-700'
                          : status === 'Approved'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {status}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
