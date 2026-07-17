import { requirePartner } from '@/lib/partners/auth'
import { prisma } from '@/lib/prisma'
import { commissionSummary } from '@/lib/partners/queries'
import { formatCents } from '@/lib/partners/commission'

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
              {ctx.kind === 'ORG' && <th className="px-4 py-3">Payee</th>}
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Notes</th>
              <th className="px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {payouts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  No payouts recorded yet. Approved commission is paid out by the PeptSci team on
                  the regular payout schedule.
                </td>
              </tr>
            )}
            {payouts.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="px-4 py-3">{p.paidAt.toLocaleDateString()}</td>
                {ctx.kind === 'ORG' && (
                  <td className="px-4 py-3">{p.payee === 'ORG' ? 'Organization' : p.rep?.name || 'Rep'}</td>
                )}
                <td className="px-4 py-3">{p.method || '—'}</td>
                <td className="px-4 py-3">{p.reference || '—'}</td>
                <td className="max-w-[240px] truncate px-4 py-3 text-slate-500">{p.notes || '—'}</td>
                <td className="px-4 py-3 text-right font-medium">{formatCents(p.amountCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
