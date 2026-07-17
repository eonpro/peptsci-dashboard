import Link from 'next/link'
import { requirePartner } from '@/lib/partners/auth'
import { clinicBook } from '@/lib/partners/queries'
import { formatCents } from '@/lib/partners/commission'

export const dynamic = 'force-dynamic'

const STAGE_BADGE: Record<string, string> = {
  LEAD: 'bg-slate-100 text-slate-600',
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  AT_RISK: 'bg-amber-100 text-amber-700',
  DORMANT: 'bg-red-100 text-red-600',
}

export default async function PartnerClinicsPage() {
  const ctx = await requirePartner()
  const rows = await clinicBook(
    { orgId: ctx.org.id, ...(ctx.rep ? { repId: ctx.rep.id } : {}) },
    ctx.kind
  )

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clinics</h1>
          <p className="text-sm text-slate-500">
            Your book of business — every clinic attributed to {ctx.kind === 'REP' ? 'you' : 'your organization'}.
          </p>
        </div>
        {/* Plain anchor: this is a file download served by a route handler,
            not a client navigation — <Link/> would prefetch the CSV. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/partners/exports/clinics"
          className="rounded-lg border px-3 py-1.5 text-sm text-slate-600 hover:bg-white"
        >
          Export CSV
        </a>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Clinic</th>
              <th className="px-4 py-3">Stage</th>
              {ctx.kind === 'ORG' && <th className="px-4 py-3">Rep</th>}
              <th className="px-4 py-3">Since</th>
              <th className="px-4 py-3">Last order</th>
              <th className="px-4 py-3 text-right">Revenue</th>
              <th className="px-4 py-3 text-right">Your commission</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  No clinics yet. Share a referral link to start building your book.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.clientId} className="border-b last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/partners/clinics/${row.clientId}`}
                    className="font-medium text-[#213cef] hover:underline"
                  >
                    {row.organizationName}
                  </Link>
                  {row.contactName && <div className="text-xs text-slate-400">{row.contactName}</div>}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_BADGE[row.stage] ?? STAGE_BADGE.ACTIVE}`}>
                    {row.stage.replace('_', ' ')}
                  </span>
                </td>
                {ctx.kind === 'ORG' && <td className="px-4 py-3">{row.repName || '—'}</td>}
                <td className="px-4 py-3">{row.createdAt.toLocaleDateString()}</td>
                <td className="px-4 py-3">{row.lastOrderAt ? row.lastOrderAt.toLocaleDateString() : '—'}</td>
                <td className="px-4 py-3 text-right">{formatCents(row.revenueCents)}</td>
                <td className="px-4 py-3 text-right font-medium">{formatCents(row.commissionCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
