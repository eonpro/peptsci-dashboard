'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { LifeBuoy, Plus, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { SupportChat } from '@/components/support/SupportChat'

interface TicketRow {
  id: string
  subject: string
  status: 'OPEN' | 'PENDING' | 'RESOLVED'
  updatedAt: string
  lastMessage: { body: string; senderRole: string } | null
  unread: number
}

const STATUS_STYLE: Record<TicketRow['status'], string> = {
  OPEN: 'bg-blue-500/15 text-blue-300 border border-blue-500/30',
  PENDING: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
  RESOLVED: 'bg-green-500/15 text-green-300 border border-green-500/30',
}

const STATUS_LABEL: Record<TicketRow['status'], string> = {
  OPEN: 'Open',
  PENDING: 'Awaiting your reply',
  RESOLVED: 'Resolved',
}

export default function ShopSupportPage() {
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/shop/support/tickets')
      const payload = await res.json()
      if (res.ok) setTickets(payload.tickets ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const createTicket = async () => {
    if (creating) return
    setCreating(true)
    try {
      const res = await fetch('/api/shop/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), message: message.trim() }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(payload.message || 'Could not open the ticket.')
        return
      }
      toast.success('Ticket opened — our team will get back to you.')
      setSubject('')
      setMessage('')
      setShowForm(false)
      await load()
      setSelected(payload.ticket?.id ?? null)
    } finally {
      setCreating(false)
    }
  }

  const selectedTicket = tickets.find((t) => t.id === selected) ?? null

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <LifeBuoy className="h-6 w-6 text-brand-primary" />
            Support
          </h1>
          <p className="text-white/50 text-sm mt-1">
            Open a ticket and our team will reply here and by notification.
          </p>
        </div>
        <Button
          onClick={() => setShowForm((v) => !v)}
          className="bg-brand-primary hover:bg-[#1a30c0] text-white"
        >
          <Plus className="h-4 w-4 mr-1" /> New ticket
        </Button>
      </div>

      {showForm && (
        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="text-white text-base">New support ticket</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject (e.g. Question about order #1042)"
              maxLength={200}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
            />
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="How can we help?"
              rows={4}
              maxLength={4000}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30 resize-none"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowForm(false)} className="text-white/60">
                Cancel
              </Button>
              <Button
                onClick={createTicket}
                disabled={creating || subject.trim().length < 3 || !message.trim()}
                className="bg-brand-primary hover:bg-[#1a30c0] text-white"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Open ticket
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-[minmax(0,320px)_1fr]">
        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="text-white text-base">Your tickets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <div className="flex justify-center py-8 text-white/40">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : tickets.length === 0 ? (
              <p className="text-white/40 text-sm py-4 text-center">
                No tickets yet. Open one and we&rsquo;ll take it from there.
              </p>
            ) : (
              tickets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelected(t.id)}
                  className={`w-full text-left rounded-xl border p-3 transition-colors ${
                    selected === t.id
                      ? 'border-brand-primary/60 bg-brand-primary/10'
                      : 'border-white/10 bg-white/5 hover:border-white/25'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-white truncate">{t.subject}</span>
                    {t.unread > 0 && (
                      <span className="shrink-0 rounded-full bg-brand-primary text-white text-[10px] font-bold px-1.5 py-0.5">
                        {t.unread}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <Badge className={`${STATUS_STYLE[t.status]} text-[10px]`}>
                      {STATUS_LABEL[t.status]}
                    </Badge>
                    <span className="text-[11px] text-white/40">
                      {new Date(t.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="text-white text-base truncate">
              {selectedTicket ? selectedTicket.subject : 'Select a ticket'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedTicket ? (
              <SupportChat ticketId={selectedTicket.id} viewerRole="CLINIC" onActivity={load} />
            ) : (
              <div className="flex h-[420px] items-center justify-center text-white/30 text-sm">
                Pick a ticket on the left, or open a new one.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
