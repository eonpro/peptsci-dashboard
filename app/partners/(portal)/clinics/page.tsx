import Link from 'next/link'
import { Building2 } from 'lucide-react'
import { requirePartner } from '@/lib/partners/auth'
import { clinicBook } from '@/lib/partners/queries'
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
import { Card } from '@/components/ui/card'
import { PageHeader } from '../_components/PageHeader'

export const dynamic = 'force-dynamic'

const STAGE_BADGE: Record<string, string> = {
  LEAD: 'border-slate-200 bg-slate-100 text-slate-600',
  ACTIVE: 'border-emerald-200 bg-emerald-100 text-emerald-700',
  AT_RISK: 'border-amber-200 bg-amber-100 text-amber-700',
  DORMANT: 'border-red-200 bg-red-100 text-red-600',
}

export default async function PartnerClinicsPage() {
  const ctx = await requirePartner()
  const rows = await clinicBook(
    { orgId: ctx.org.id, ...(ctx.rep ? { repId: ctx.rep.id } : {}) },
    ctx.kind
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clinics"
        description={
          <>
            Your book of business — every clinic attributed to{' '}
            {ctx.kind === 'REP' ? 'you' : 'your organization'}.
          </>
        }
        actions={
          /* Plain anchor: this is a file download served by a route handler,
             not a client navigation — <Link/> would prefetch the CSV. */
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          <a
            href="/partners/exports/clinics"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'bg-white text-slate-600')}
          >
            Export CSV
          </a>
        }
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              <TableHead className="text-xs uppercase tracking-wide">Clinic</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Stage</TableHead>
              {ctx.kind === 'ORG' && (
                <TableHead className="text-xs uppercase tracking-wide">Rep</TableHead>
              )}
              <TableHead className="text-xs uppercase tracking-wide">Since</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Last order</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide">Revenue</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide">Your commission</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>
                  <EmptyState
                    icon={Building2}
                    title="No clinics yet"
                    description="Share a referral link to start building your book."
                    className="py-6"
                  />
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={row.clientId}>
                <TableCell className="py-3">
                  <Link
                    href={`/partners/clinics/${row.clientId}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {row.organizationName}
                  </Link>
                  {row.contactName && <div className="text-xs text-slate-400">{row.contactName}</div>}
                </TableCell>
                <TableCell className="py-3">
                  <Badge
                    variant="outline"
                    className={cn('font-medium', STAGE_BADGE[row.stage] ?? STAGE_BADGE.ACTIVE)}
                  >
                    {row.stage.replace('_', ' ')}
                  </Badge>
                </TableCell>
                {ctx.kind === 'ORG' && <TableCell className="py-3">{row.repName || '—'}</TableCell>}
                <TableCell className="py-3">{row.createdAt.toLocaleDateString()}</TableCell>
                <TableCell className="py-3">
                  {row.lastOrderAt ? row.lastOrderAt.toLocaleDateString() : '—'}
                </TableCell>
                <TableCell className="py-3 text-right">{formatCents(row.revenueCents)}</TableCell>
                <TableCell className="py-3 text-right font-medium">
                  {formatCents(row.commissionCents)}
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
