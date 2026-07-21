import { requirePartner } from '@/lib/partners/auth'
import { prisma } from '@/lib/prisma'
import { FileText, FolderOpen, Image as ImageIcon, Type } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { CopyTextButton } from './CopyTextButton'
import { PageHeader } from '../_components/PageHeader'

export const dynamic = 'force-dynamic'

const KIND_ICON = { IMAGE: ImageIcon, DOCUMENT: FileText, COPY: Type } as const

export default async function PartnerAssetsPage() {
  await requirePartner()
  const assets = await prisma!.partnerAsset.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketing assets"
        description="Ready-to-use banners, one-pagers, and copy blocks — pair them with your referral links and tracked UTM sources."
      />

      {assets.length === 0 ? (
        <Card>
          <EmptyState
            icon={FolderOpen}
            title="No assets published yet"
            description="Check back soon — the PeptSci team adds new marketing material regularly."
            className="py-10"
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((asset) => {
            const Icon = KIND_ICON[asset.kind]
            return (
              <Card key={asset.id} className="flex flex-col p-4 transition-shadow hover:shadow-md">
                {asset.kind === 'IMAGE' && asset.blobUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={asset.blobUrl}
                    alt={asset.title}
                    className="mb-3 h-36 w-full rounded-lg border object-cover"
                  />
                )}
                <div className="flex items-start gap-2">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{asset.title}</p>
                    {asset.description && (
                      <p className="mt-0.5 text-xs text-slate-500">{asset.description}</p>
                    )}
                  </div>
                </div>
                {asset.kind === 'COPY' && asset.copyText && (
                  <pre className="mt-3 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                    {asset.copyText}
                  </pre>
                )}
                <div className="mt-auto pt-3">
                  {asset.kind === 'COPY' && asset.copyText ? (
                    <CopyTextButton text={asset.copyText} />
                  ) : asset.blobUrl ? (
                    <a
                      href={asset.blobUrl}
                      download={asset.fileName ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(buttonVariants({ size: 'sm' }), 'text-xs font-semibold')}
                    >
                      Download
                    </a>
                  ) : null}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
