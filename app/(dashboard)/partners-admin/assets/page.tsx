'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ImagePlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface AssetRow {
  id: string
  title: string
  description: string | null
  kind: 'IMAGE' | 'DOCUMENT' | 'COPY'
  blobUrl: string | null
  fileName: string | null
  copyText: string | null
  isActive: boolean
  createdAt: string
}

/** Admin manager for the partner marketing asset library. */
export default function PartnerAssetsAdminPage() {
  const [assets, setAssets] = useState<AssetRow[]>([])
  const [busy, setBusy] = useState(false)
  const [kind, setKind] = useState<'IMAGE' | 'DOCUMENT' | 'COPY'>('IMAGE')

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/partners/assets')
    if (res.ok) setAssets((await res.json()).assets)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function publish(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formEl = e.currentTarget
    const form = new FormData(formEl)
    const file = form.get('file') as File | null
    setBusy(true)
    try {
      let filePayload = {}
      if (kind !== 'COPY') {
        if (!file || file.size === 0) {
          toast.error('Choose a file')
          return
        }
        if (file.size > 6 * 1024 * 1024) {
          toast.error('File too large (6MB max)')
          return
        }
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(file)
        })
        filePayload = { fileName: file.name, contentType: file.type, base64 }
      }
      const res = await fetch('/api/admin/partners/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.get('title'),
          description: form.get('description') || '',
          kind,
          copyText: form.get('copyText') || '',
          ...filePayload,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.message || 'Publish failed')
        return
      }
      toast.success('Asset published to all partners')
      formEl.reset()
      void load()
    } finally {
      setBusy(false)
    }
  }

  async function toggle(asset: AssetRow) {
    const res = await fetch('/api/admin/partners/assets', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetId: asset.id, isActive: !asset.isActive }),
    })
    if (res.ok) void load()
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <Link
          href="/partners-admin"
          className="mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> All partners
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ImagePlus className="h-6 w-6 text-muted-foreground" /> Partner marketing assets
        </h1>
        <p className="text-sm text-muted-foreground">
          Banners, one-pagers, and copy blocks published here appear in every partner&rsquo;s
          portal under Assets.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={publish} className="grid gap-3 sm:grid-cols-2">
            <input name="title" required placeholder="Title *" className="rounded-md border px-3 py-2 text-sm" />
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
              className="rounded-md border px-3 py-2 text-sm"
            >
              <option value="IMAGE">Image / banner</option>
              <option value="DOCUMENT">Document (PDF)</option>
              <option value="COPY">Copy block (text)</option>
            </select>
            <input
              name="description"
              placeholder="Short description"
              className="rounded-md border px-3 py-2 text-sm sm:col-span-2"
            />
            {kind === 'COPY' ? (
              <textarea
                name="copyText"
                rows={4}
                placeholder="Paste-ready copy for partners…"
                className="rounded-md border px-3 py-2 text-sm sm:col-span-2"
              />
            ) : (
              <input
                name="file"
                type="file"
                accept={kind === 'IMAGE' ? 'image/*' : 'application/pdf'}
                className="text-sm sm:col-span-2"
              />
            )}
            <div className="sm:col-span-2">
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? 'Publishing…' : 'Publish asset'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {assets.map((asset) => (
          <Card key={asset.id}>
            <CardContent className="pt-5">
              {asset.kind === 'IMAGE' && asset.blobUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={asset.blobUrl} alt={asset.title} className="mb-3 h-32 w-full rounded-lg border object-cover" />
              )}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{asset.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {asset.kind} · {new Date(asset.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Badge className={asset.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}>
                  {asset.isActive ? 'Live' : 'Hidden'}
                </Badge>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2 h-auto p-0 text-sm text-muted-foreground hover:bg-transparent hover:underline"
                onClick={() => void toggle(asset)}
              >
                {asset.isActive ? 'Unpublish' : 'Publish'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
