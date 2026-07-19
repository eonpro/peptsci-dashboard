'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Loader2, RefreshCw, RotateCcw, Webhook, CheckCircle2 } from 'lucide-react'

type EventRow = {
  id: string
  eventId: string
  eventType: string
  status: 'RECEIVED' | 'SUCCESS' | 'ERROR'
  errorMessage: string | null
  retryCount: number
  processingMs: number | null
  processedAt: string | null
  createdAt: string
}

const STATUS_TABS = [
  { id: 'ERROR', label: 'Failed' },
  { id: 'SUCCESS', label: 'Succeeded' },
  { id: 'all', label: 'All' },
] as const

const statusStyles: Record<EventRow['status'], string> = {
  ERROR: 'border-red-500/30 text-red-400',
  SUCCESS: 'border-green-500/30 text-green-400',
  RECEIVED: 'border-amber-500/30 text-amber-400',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function WebhookEventsPage() {
  const [status, setStatus] = useState<(typeof STATUS_TABS)[number]['id']>('ERROR')
  const [events, setEvents] = useState<EventRow[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [retrying, setRetrying] = useState<string | null>(null)

  const load = useCallback(
    async (cursor?: string | null) => {
      cursor ? setLoadingMore(true) : setLoading(true)
      try {
        const url = new URL('/api/admin/webhook-events', window.location.origin)
        url.searchParams.set('status', status)
        if (cursor) url.searchParams.set('cursor', cursor)
        const res = await fetch(url.toString())
        const data = await res.json()
        if (!res.ok) throw new Error(data.message || 'Failed to load webhook events')
        setEvents((prev) => (cursor ? [...prev, ...data.events] : data.events))
        setNextCursor(data.nextCursor ?? null)
        setCounts(data.counts ?? {})
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load webhook events')
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [status]
  )

  useEffect(() => {
    void load()
  }, [load])

  const retry = async (row: EventRow) => {
    setRetrying(row.id)
    try {
      const res = await fetch(`/api/admin/webhook-events/${row.id}/retry`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Retry failed')
      if (data.success) {
        toast.success(`Event ${row.eventType} reprocessed successfully`)
      } else {
        toast.error(`Retry failed: ${data.error || 'unknown error'}`)
      }
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Retry failed')
    } finally {
      setRetrying(null)
    }
  }

  const failedCount = counts.ERROR ?? 0

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <Webhook className="h-6 w-6" /> Webhook Events
          </h1>
          <p className="mt-1 text-sm text-white/50">
            Stripe webhook delivery log. Failed events (the dead-letter queue) can be replayed
            here — all handlers are idempotent, so retries are safe.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => load()}
          disabled={loading}
          className="border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="flex gap-2">
        {STATUS_TABS.map((tab) => (
          <Button
            key={tab.id}
            size="sm"
            variant={status === tab.id ? 'default' : 'outline'}
            onClick={() => setStatus(tab.id)}
            className={
              status === tab.id
                ? 'bg-brand-primary text-white hover:bg-[#1a30c0]'
                : 'border-white/20 text-white/70 hover:bg-white/10 hover:text-white'
            }
          >
            {tab.label}
            {tab.id === 'ERROR' && failedCount > 0 && (
              <span className="ml-2 rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-300">
                {failedCount}
              </span>
            )}
          </Button>
        ))}
      </div>

      <Card className="bg-[#0a0e3a]/50 border-white/10">
        <CardHeader>
          <CardTitle className="text-base text-white">
            {status === 'ERROR' ? 'Dead-letter queue' : 'Deliveries'}
          </CardTitle>
          <CardDescription className="text-white/50">
            {counts.SUCCESS ?? 0} succeeded · {counts.ERROR ?? 0} failed ·{' '}
            {counts.RECEIVED ?? 0} in flight
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10 text-white/50">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-white/50">
              <CheckCircle2 className="h-8 w-8 text-green-400/60" />
              {status === 'ERROR' ? 'No failed webhook events — all clear.' : 'No events yet.'}
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {events.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm text-white">{row.eventType}</span>
                      <Badge variant="outline" className={`text-xs ${statusStyles[row.status]}`}>
                        {row.status}
                      </Badge>
                      {row.retryCount > 0 && (
                        <span className="text-xs text-white/40">retries: {row.retryCount}</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-white/40">
                      {row.eventId} · {formatDate(row.createdAt)}
                      {row.processingMs != null ? ` · ${row.processingMs}ms` : ''}
                    </p>
                    {row.errorMessage && (
                      <p className="mt-1 break-words text-xs text-red-300/90">{row.errorMessage}</p>
                    )}
                  </div>
                  {row.status === 'ERROR' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={retrying === row.id}
                      onClick={() => void retry(row)}
                      className="shrink-0 border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
                    >
                      {retrying === row.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="mr-2 h-4 w-4" />
                      )}
                      Retry
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
          {nextCursor && !loading && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                disabled={loadingMore}
                onClick={() => void load(nextCursor)}
                className="border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
              >
                {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Load more
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
