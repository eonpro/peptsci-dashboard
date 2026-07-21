'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { LifeBuoy, Loader2, CheckCircle2, RotateCcw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SupportChat } from '@/components/support/SupportChat'

type TicketStatus = 'OPEN' | 'PENDING' | 'RESOLVED'

interface TicketRow {
  id: string
  subject: string
  status: TicketStatus
  client: { id: string; organizationName: string; contactEmail: string | null }
  updatedAt: string
  lastMessage: { body: string; senderRole: string } | null
  unread: number
}

const STATUS_STYLE: Record<TicketStatus, string> = {
  OPEN: 'bg-blue-500/15 text-blue-500 border border-blue-500/30',
  PENDING: 'bg-amber-500/15 text-amber-600 border border-amber-500/30',
  RESOLVED: 'bg-green-500/15 text-green-600 border border-green-500/30',
}

const FILTERS: Array<{ value: TicketStatus | 'ALL'; label: string }> = [
  { value: 'OPEN', label: 'Open' },
  { value: 'PENDING', label: 'Waiting on clinic' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'ALL', label: 'All' },
]

function SupportQueue() {
  const searchParams = useSearchParams()
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<TicketStatus | 'ALL'>('OPEN')
  const [selected, setSelected] = useState<string | null>(searchParams.get('ticket'))
  const [updating, setUpdating] = useState(false)

  const load = useCallback(async () => {
    try {
      const qs = filter === 'ALL' ? '' : `?status=${filter}`
      const res = await fetch(`/api/admin/support/tickets${qs}`)
      const payload = await res.json()
      if (res.ok) setTickets(payload.tickets ?? [])
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  // Deep link (?ticket=…) may point at a ticket outside the current filter —
  // fall back to All so the bell link always lands on the thread.
  const deepLinked = searchParams.get('ticket')
  useEffect(() => {
    if (deepLinked && !loading && filter === 'OPEN' && !tickets.some((t) => t.id === deepLinked)) {
      setFilter('ALL')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinked, loading])

  const selectedTicket = tickets.find((t) => t.id === selected) ?? null

  const setStatus = async (status: TicketStatus) => {
    if (!selectedTicket || updating) return
    setUpdating(true)
    try {
      const res = await fetch(`/api/admin/support/tickets/${selectedTicket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(payload.message || 'Could not update the ticket.')
        return
      }
      toast.success(status === 'RESOLVED' ? 'Ticket resolved.' : 'Ticket reopened.')
      await load()
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <LifeBuoy className="h-6 w-6 text-brand-primary" />
          Support
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Clinic tickets — replies notify the clinic&rsquo;s users in their portal.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            size="sm"
            variant={filter === f.value ? 'default' : 'outline'}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tickets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <div className="flex justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : tickets.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">
                Nothing here — the queue is clear.
              </p>
            ) : (
              tickets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelected(t.id)}
                  className={`w-full text-left rounded-xl border p-3 transition-colors ${
                    selected === t.id
                      ? 'border-brand-primary/60 bg-brand-primary/5'
                      : 'border-border bg-card hover:border-foreground/25'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">{t.subject}</span>
                    {t.unread > 0 && (
                      <span className="shrink-0 rounded-full bg-brand-primary text-white text-[10px] font-bold px-1.5 py-0.5">
                        {t.unread}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground truncate">
                    {t.client.organizationName}
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <Badge className={`${STATUS_STYLE[t.status]} text-[10px]`}>{t.status}</Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(t.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-base truncate">
              {selectedTicket
                ? `${selectedTicket.subject} — ${selectedTicket.client.organizationName}`
                : 'Select a ticket'}
            </CardTitle>
            {selectedTicket &&
              (selectedTicket.status === 'RESOLVED' ? (
                <Button size="sm" variant="outline" disabled={updating} onClick={() => setStatus('OPEN')}>
                  <RotateCcw className="h-4 w-4 mr-1" /> Reopen
                </Button>
              ) : (
                <Button size="sm" disabled={updating} onClick={() => setStatus('RESOLVED')}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Resolve
                </Button>
              ))}
          </CardHeader>
          <CardContent>
            {selectedTicket ? (
              <SupportChat ticketId={selectedTicket.id} viewerRole="PEPTSCI" onActivity={load} />
            ) : (
              <div className="flex h-[420px] items-center justify-center text-muted-foreground text-sm">
                Pick a ticket from the queue.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function SupportPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      }
    >
      <SupportQueue />
    </Suspense>
  )
}
