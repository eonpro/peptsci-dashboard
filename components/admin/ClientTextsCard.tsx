'use client'

/**
 * Client detail → Texts: the practice's SMS conversations (PeptSci Alerts
 * line) with consent state and unread counts, deep-linking into /messages.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, MessageSquareText, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface Row {
  id: string
  phoneDisplay: string
  contactName: string | null
  status: string
  unreadCount: number
  lastMessageAt: string | null
  lastMessagePreview: string | null
  lastDirection: string | null
  consent: 'SUBSCRIBED' | 'OPTED_OUT' | 'UNKNOWN'
  assignedTo: { id: string; name: string } | null
}

const CONSENT: Record<Row['consent'], { label: string; className: string }> = {
  SUBSCRIBED: { label: 'Subscribed', className: 'bg-green-500/15 text-green-400' },
  OPTED_OUT: { label: 'STOP', className: 'bg-red-500/15 text-red-400' },
  UNKNOWN: { label: 'No consent', className: 'bg-amber-500/15 text-amber-400' },
}

export function ClientTextsCard({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)

  const load = useCallback(() => {
    fetch(`/api/admin/messages/conversations?status=ALL&clientId=${encodeURIComponent(clientId)}`)
      .then(async (r) => {
        if (r.status === 403) {
          setForbidden(true)
          return { conversations: [] }
        }
        return r.ok ? r.json() : { conversations: [] }
      })
      .then((data) => setRows(data.conversations ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [clientId])

  useEffect(() => {
    load()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, 60_000)
    return () => clearInterval(timer)
  }, [load])

  return (
    <Card className="bg-[#0a0e3a]/50 border-white/10">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base text-white">
            <MessageSquareText className="h-5 w-5" /> Texts
          </CardTitle>
          <CardDescription className="text-white/50">
            SMS conversations with this practice on the PeptSci Alerts line — tracking texts, their
            replies, and staff answers.
          </CardDescription>
        </div>
        <Button asChild size="sm" variant="outline" className="shrink-0 border-white/20 text-white">
          <Link href="/messages">
            Open inbox <ExternalLink className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-white/40">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : forbidden ? (
          <p className="py-4 text-center text-sm text-white/50">
            You need the Support permission to view text conversations.
          </p>
        ) : rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-white/50">
            No texts yet. Threads appear here once a tracking text goes out or the practice texts us.
          </p>
        ) : (
          rows.map((r) => {
            const consent = CONSENT[r.consent]
            return (
              <Link
                key={r.id}
                href={`/messages?c=${r.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 transition-colors hover:border-white/25"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm text-white">
                    <span className="font-medium">{r.phoneDisplay}</span>
                    {r.contactName && <span className="text-white/60">{r.contactName}</span>}
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${consent.className}`}>{consent.label}</span>
                    {r.status === 'CLOSED' && (
                      <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/60">Closed</span>
                    )}
                  </div>
                  {r.lastMessagePreview && (
                    <div className="mt-0.5 truncate text-xs text-white/50">
                      {r.lastDirection === 'OUTBOUND' ? 'PeptSci: ' : ''}
                      {r.lastMessagePreview}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-white/50">
                  {r.assignedTo && <span>{r.assignedTo.name}</span>}
                  {r.lastMessageAt && <span>{new Date(r.lastMessageAt).toLocaleDateString()}</span>}
                  {r.unreadCount > 0 && (
                    <span className="rounded-full bg-brand-primary px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {r.unreadCount}
                    </span>
                  )}
                </div>
              </Link>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
