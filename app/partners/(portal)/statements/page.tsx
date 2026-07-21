import { requirePartner } from '@/lib/partners/auth'
import { monthlyStatements } from '@/lib/partners/queries'
import { formatCents } from '@/lib/partners/commission'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PrintButton } from '@/app/partners/agreement/PrintButton'
import { PageHeader } from '../_components/PageHeader'

export const dynamic = 'force-dynamic'

const MONTH_LABEL = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export default async function PartnerStatementsPage() {
  const ctx = await requirePartner()
  const rows = await monthlyStatements(
    { orgId: ctx.org.id, ...(ctx.rep ? { repId: ctx.rep.id } : {}) },
    ctx.kind,
    12
  )
  const newestFirst = [...rows].reverse()

  return (
    <div className="space-y-6">
      <PageHeader
        className="print:hidden"
        title="Statements"
        description="Month-by-month commission activity with a true running balance — your books and ours, always in agreement."
        actions={
          <>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- CSV download route */}
            <a
              href="/partners/exports/statements"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'bg-white text-slate-600')}
            >
              Export CSV
            </a>
            <PrintButton />
          </>
        }
      />

      <div className="hidden print:block">
        <h1 className="text-xl font-bold">PeptSci Partner Statement — {ctx.org.name}</h1>
        <p className="text-sm text-slate-500">
          {ctx.kind === 'REP' ? `Rep: ${ctx.rep!.name} · ` : ''}Generated{' '}
          {new Date().toLocaleDateString()}
        </p>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Month</th>
              <th className="px-4 py-3 text-right">Earned</th>
              <th className="px-4 py-3 text-right">Reversed</th>
              <th className="px-4 py-3 text-right">Paid out</th>
              <th className="px-4 py-3 text-right">Closing balance</th>
            </tr>
          </thead>
          <tbody>
            {newestFirst.map((row) => {
              const [year, month] = row.month.split('-').map(Number)
              const label = MONTH_LABEL.format(new Date(Date.UTC(year, month - 1, 1)))
              const empty =
                row.earnedCents === 0 && row.reversedCents === 0 && row.paidCents === 0
              return (
                <tr key={row.month} className={`border-b last:border-0 ${empty ? 'text-slate-400' : ''}`}>
                  <td className="px-4 py-3 font-medium">{label}</td>
                  <td className="px-4 py-3 text-right text-emerald-700">
                    {row.earnedCents > 0 ? formatCents(row.earnedCents) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-red-600">
                    {row.reversedCents > 0 ? `−${formatCents(row.reversedCents)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.paidCents > 0 ? formatCents(row.paidCents) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {formatCents(row.closingUnpaidCents)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      </Card>
      <p className="text-xs text-slate-400 print:hidden">
        Earned is net new commission in the month; Reversed is refund clawbacks; Closing balance
        is your cumulative unpaid commission at month end.
      </p>
    </div>
  )
}
