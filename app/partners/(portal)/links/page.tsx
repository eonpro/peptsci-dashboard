'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Copy, Link2, PanelTop, Plus, QrCode, Tags } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '../_components/PageHeader'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface LinkRow {
  id: string
  code: string
  url: string
  landingUrl: string
  label: string | null
  active: boolean
  clickCount: number
  signupCount: number
  rep: { id: string; name: string } | null
}

interface Analytics {
  series: Array<{ date: string; clicks: number; uniques: number }>
  totals: { clicks: number; uniques: number; signups: number }
  topSources: Array<{ source: string; clicks: number }>
}

export default function PartnerLinksPage() {
  const [links, setLinks] = useState<LinkRow[]>([])
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [label, setLabel] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/partners/links')
      const data = await res.json()
      if (res.ok) {
        setLinks(data.links)
        setAnalytics(data.analytics ?? null)
      } else {
        toast.error(data.message || 'Failed to load links')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function createLink() {
    setCreating(true)
    try {
      const res = await fetch('/api/partners/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.message || 'Failed to create link')
        return
      }
      toast.success('Referral link created')
      setLabel('')
      void load()
    } finally {
      setCreating(false)
    }
  }

  async function toggle(link: LinkRow) {
    const res = await fetch('/api/partners/links', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkId: link.id, active: !link.active }),
    })
    if (res.ok) {
      toast.success(link.active ? 'Link deactivated — it no longer attributes signups' : 'Link reactivated')
      void load()
    } else {
      toast.error('Failed to update link')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Referral links"
        description="Share these links with prospective clinics. Anyone who signs up within 90 days of clicking is attributed to you."
      />

      {/* 30-day click analytics */}
      {analytics && analytics.totals.clicks > 0 && (
        <Card className="p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-slate-700">Last 30 days</p>
            <p className="text-xs text-slate-500">
              <strong>{analytics.totals.clicks}</strong> clicks ·{' '}
              <strong>{analytics.totals.uniques}</strong> unique visitors ·{' '}
              <strong>{analytics.totals.signups}</strong> signups all-time
            </p>
          </div>
          <div className="flex h-20 items-end gap-[2px]">
            {analytics.series.map((point) => {
              const max = Math.max(1, ...analytics.series.map((p) => p.clicks))
              return (
                <div
                  key={point.date}
                  title={`${point.date}: ${point.clicks} clicks (${point.uniques} unique)`}
                  className="flex-1 rounded-t bg-brand-primary/70 transition-colors hover:bg-brand-primary"
                  style={{ height: `${Math.max(3, (point.clicks / max) * 100)}%` }}
                />
              )
            })}
          </div>
          {analytics.topSources.length > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              Top sources:{' '}
              {analytics.topSources.map((s, i) => (
                <span key={s.source}>
                  {i > 0 && ' · '}
                  <code className="rounded bg-slate-100 px-1">{s.source}</code> {s.clicks}
                </span>
              ))}
            </p>
          )}
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-4">
          <Link2 className="h-4 w-4 text-slate-400" />
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={120}
            placeholder="Label (e.g. Spring conference booth)"
            className="min-w-[240px] flex-1 bg-white"
            aria-label="Link label"
          />
          <Button onClick={() => void createLink()} disabled={creating} className="gap-1 font-semibold">
            <Plus className="h-4 w-4" /> New link
          </Button>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              <TableHead className="text-xs uppercase tracking-wide">Link</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Label</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Owner</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide">Clicks</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide">Signups</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
              <TableHead className="text-xs uppercase tracking-wide" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              [0, 1, 2].map((i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7} className="py-3">
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!loading && links.length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>
                  <EmptyState
                    icon={Link2}
                    title="No links yet"
                    description="Create your first referral link above."
                    className="py-6"
                  />
                </TableCell>
              </TableRow>
            )}
            {links.map((link) => (
              <TableRow key={link.id}>
                <TableCell className="py-3">
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-slate-100 px-2 py-1 text-xs">{link.url}</code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-slate-400 hover:text-slate-700"
                      onClick={() => {
                        void navigator.clipboard.writeText(link.url)
                        toast.success('Copied to clipboard')
                      }}
                      aria-label="Copy link"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-slate-400 hover:text-slate-700"
                      onClick={() => {
                        void navigator.clipboard.writeText(link.landingUrl)
                        toast.success('Invitation page link copied — a branded landing page for prospects')
                      }}
                      aria-label="Copy invitation page link"
                      title="Copy invitation page link"
                    >
                      <PanelTop className="h-4 w-4" />
                    </Button>
                    <a
                      href={`/api/partners/links/qr?linkId=${link.id}`}
                      download
                      className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:text-slate-700"
                      aria-label="Download QR code"
                      title="Download QR code"
                    >
                      <QrCode className="h-4 w-4" />
                    </a>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-slate-400 hover:text-slate-700"
                      onClick={() => {
                        const source = window.prompt('utm_source (e.g. instagram, newsletter):', 'newsletter')
                        if (source === null) return
                        const campaign = window.prompt('utm_campaign (optional):', '') ?? ''
                        const url = new URL(link.url)
                        if (source) url.searchParams.set('utm_source', source.trim())
                        if (campaign) url.searchParams.set('utm_campaign', campaign.trim())
                        void navigator.clipboard.writeText(url.toString())
                        toast.success('Tracked link copied — clicks will report this source')
                      }}
                      aria-label="Build tracked UTM link"
                      title="Build tracked UTM link"
                    >
                      <Tags className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell className="py-3">{link.label || '—'}</TableCell>
                <TableCell className="py-3">{link.rep?.name || 'Organization'}</TableCell>
                <TableCell className="py-3 text-right">{link.clickCount}</TableCell>
                <TableCell className="py-3 text-right">{link.signupCount}</TableCell>
                <TableCell className="py-3">
                  <Badge
                    variant="outline"
                    className={cn(
                      'font-medium',
                      link.active
                        ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                        : 'border-slate-200 bg-slate-100 text-slate-500'
                    )}
                  >
                    {link.active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell className="py-3 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 text-sm text-primary hover:bg-transparent hover:underline"
                    onClick={() => void toggle(link)}
                  >
                    {link.active ? 'Deactivate' : 'Activate'}
                  </Button>
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
