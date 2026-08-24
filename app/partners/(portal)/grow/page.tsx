import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PageHeader } from '../_components/PageHeader'
import { PartnerHubGrid } from '../_components/PartnerHubGrid'
import { PARTNER_GROW_LINKS } from '@/lib/partners/portal'
import { requirePartner } from '@/lib/partners/auth'
import { partnerCanMutate } from '@/lib/partners/portal'

export const dynamic = 'force-dynamic'

export default async function PartnerGrowPage() {
  const ctx = await requirePartner()
  const canWrite = partnerCanMutate(ctx.kind, ctx.role)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Grow"
        description="Start with a referral link. Prospects, quotes, and your clinic book live here so they are not competing with Home."
        actions={
          canWrite ? (
            <Button asChild className="font-semibold">
              <Link href="/partners/links">Create referral link</Link>
            </Button>
          ) : undefined
        }
      />
      <PartnerHubGrid links={PARTNER_GROW_LINKS} />
    </div>
  )
}
