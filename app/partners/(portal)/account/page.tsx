import { requirePartner } from '@/lib/partners/auth'
import { visibleAccountLinks } from '@/lib/partners/portal'
import { PageHeader } from '../_components/PageHeader'
import { PartnerHubGrid } from '../_components/PartnerHubGrid'

export const dynamic = 'force-dynamic'

export default async function PartnerAccountPage() {
  const ctx = await requirePartner()
  const links = visibleAccountLinks({
    kind: ctx.kind,
    role: ctx.role,
    marginModel: ctx.org.compensationModel === 'MARGIN',
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Account"
        description="Sellers earn commission. Portal access is who can log in. Terms holds your W-9."
      />
      <PartnerHubGrid links={links} />
    </div>
  )
}
