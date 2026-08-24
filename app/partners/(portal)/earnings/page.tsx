import Link from 'next/link'
import { requirePartner } from '@/lib/partners/auth'
import { commissionSummary } from '@/lib/partners/queries'
import { formatCents } from '@/lib/partners/commission'
import { PARTNER_EARNINGS_LINKS, partnerCanMutate } from '@/lib/partners/portal'
import { PageHeader } from '../_components/PageHeader'
import { PartnerHubGrid } from '../_components/PartnerHubGrid'
import { StatCard } from '../_components/StatCard'
import { RequestPayoutButton } from '../payouts/RequestPayoutButton'
import { Banknote, FileWarning, Hourglass } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function PartnerEarningsPage() {
  const ctx = await requirePartner()
  const summary = await commissionSummary(
    { orgId: ctx.org.id, ...(ctx.rep ? { repId: ctx.rep.id } : {}) },
    ctx.kind
  )
  const w9OnFile = Boolean(ctx.org.w9BlobUrl)
  const canWrite = partnerCanMutate(ctx.kind, ctx.role)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Earnings"
        description="What you earned, what is unpaid, and what has been paid — one place instead of three sidebar items."
        actions={canWrite ? <RequestPayoutButton /> : undefined}
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
          sub="Approved commission waiting on a payout"
        />
        <StatCard
          label="Paid to date"
          value={formatCents(summary.paidCents)}
          icon={Banknote}
          tone="emerald"
          sub="Lifetime transfers received"
        />
      </div>

      <PartnerHubGrid links={PARTNER_EARNINGS_LINKS} />
    </div>
  )
}
