'use client'

/**
 * Messages — the SMS inbox. CRM-style queue of text conversations (one per
 * phone number, linked to a clinic), with filters, search, and the thread +
 * composer on the right. Deep link: /messages?c=<conversationId>.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Building2, Inbox, Loader2, MessageSquareText, Search, UserRound } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { SmsThread, type StaffRef } from '@/components/messages/SmsThread'

type Filter = 'OPEN' | 'UNREAD' | 'MINE' | 'CLOSED' | 'ALL'

interface ConversationRow {
  id: string
  phone: string
  phoneDisplay: string
  contactName: string | null
  title: string
  client: { id: string; organizationName: string; contactName: string | null } | null
  status: string
  assignedTo: StaffRef | null
  unreadCount: number
  lastMessageAt: string | null
  lastMessagePreview: string | null
  lastDirection: string | null
  consent: 'SUBSCRIBED' | 'OPTED_OUT' | 'UNKNOWN'
}

interface Summary {
  open: number
  unreadThreads: number
  mine: number
}

const LIST_POLL_MS = 20_000

function filterQuery(filter: Filter): string {
  switch (filter) {
    case 'OPEN':
      return 'status=OPEN'
    case 'UNREAD':
      return 'status=ALL&unread=1'
    case 'MINE':
      return 'status=OPEN&mine=1'
    case 'CLOSED':
      return 'status=CLOSED'
    default:
      return 'status=ALL'
  }
}

function relTime(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function MessagesInbox() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const [rows, setRows] = useState<ConversationRow[]>([])
  const [summary, setSummary] = useState<Summary>({ open: 0, unreadThreads: 0, mine: 0 })
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('OPEN')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [staff, setStaff] = useState<StaffRef[]>([])
  const [selected, setSelected] = useState<string | null>(searchParams.get('c'))
  const deepLinkChecked = useRef(false)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])

  const load = useCallback(async () => {
    try {
      const qs = `${filterQuery(filter)}${debounced ? `&q=${encodeURIComponent(debounced)}` : ''}`
      const res = await fetch(`/api/admin/messages/conversations?${qs}`)
      const payload = await res.json().catch(() => ({}))
      if (res.ok) {
        setRows(payload.conversations ?? [])
        setSummary(payload.summary ?? { open: 0, unreadThreads: 0, mine: 0 })
      }
    } finally {
      setLoading(false)
    }
  }, [filter, debounced])

  useEffect(() => {
    setLoading(true)
    load()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, LIST_POLL_MS)
    return () => clearInterval(timer)
  }, [load])

  useEffect(() => {
    fetch('/api/admin/messages/staff')
      .then((r) => (r.ok ? r.json() : { staff: [] }))
      .then((d) => setStaff(d.staff ?? []))
      .catch(() => {})
  }, [])

  // Deep link (?c=…) may point at a thread outside the default filter.
  useEffect(() => {
    if (deepLinkChecked.current || loading) return
    deepLinkChecked.current = true
    const c = searchParams.get('c')
    if (c && filter === 'OPEN' && !rows.some((r) => r.id === c)) setFilter('ALL')
  }, [loading, rows, filter, searchParams])

  const select = (id: string | null) => {
    setSelected(id)
    const params = new URLSearchParams(searchParams.toString())
    if (id) params.set('c', id)
    else params.delete('c')
    router.replace(`${pathname}${params.size ? `?${params}` : ''}`, { scroll: false })
  }

  const selectedRow = useMemo(() => rows.find((r) => r.id === selected) ?? null, [rows, selected])

  const FILTERS: Array<{ value: Filter; label: string; count?: number }> = [
    { value: 'OPEN', label: 'Open', count: summary.open },
    { value: 'UNREAD', label: 'Unread', count: summary.unreadThreads },
    { value: 'MINE', label: 'Mine', count: summary.mine },
    { value: 'CLOSED', label: 'Closed' },
    { value: 'ALL', label: 'All' },
  ]

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <MessageSquareText className="h-6 w-6 text-brand-primary" />
            Messages
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Two-way texts with clinics on the PeptSci Alerts line. Replies land here and page the team.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="gap-1">
            <Inbox className="h-3 w-3" /> {summary.open} open
          </Badge>
          {summary.unreadThreads > 0 && (
            <Badge className="bg-brand-primary text-white">{summary.unreadThreads} unread</Badge>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            size="sm"
            variant={filter === f.value ? 'default' : 'outline'}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
            {typeof f.count === 'number' && f.count > 0 && (
              <span className="ml-1.5 rounded-full bg-black/10 px-1.5 text-[10px] dark:bg-white/15">{f.count}</span>
            )}
          </Button>
        ))}
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clinic, contact or phone…"
            className="h-9 pl-8"
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Conversations</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[600px] space-y-2 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : rows.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {debounced ? 'No conversations match that search.' : 'Nothing here — the inbox is clear.'}
              </p>
            ) : (
              rows.map((r) => {
                const unread = r.unreadCount > 0
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => select(r.id)}
                    className={`w-full rounded-xl border p-3 text-left transition-colors ${
                      selected === r.id
                        ? 'border-brand-primary/60 bg-brand-primary/5'
                        : 'border-border bg-card hover:border-foreground/25'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`flex min-w-0 items-center gap-1.5 text-sm ${unread ? 'font-semibold' : 'font-medium'}`}>
                        {r.client ? (
                          <Building2 className="h-3.5 w-3.5 shrink-0 text-brand-primary" />
                        ) : (
                          <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate">{r.title}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className="text-[11px] text-muted-foreground">{relTime(r.lastMessageAt)}</span>
                        {unread && (
                          <span className="rounded-full bg-brand-primary px-1.5 py-0.5 text-[10px] font-bold text-white">
                            {r.unreadCount}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {r.client ? r.phoneDisplay : r.contactName ? r.phoneDisplay : 'Unlinked number'}
                      {r.assignedTo ? ` · ${r.assignedTo.name}` : ''}
                    </div>
                    {r.lastMessagePreview && (
                      <div className={`mt-1 truncate text-xs ${unread ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {r.lastDirection === 'OUTBOUND' ? 'You: ' : ''}
                        {r.lastMessagePreview}
                      </div>
                    )}
                    <div className="mt-1.5 flex items-center gap-1.5">
                      {r.status === 'CLOSED' && (
                        <Badge className="bg-muted text-[10px] text-muted-foreground">Closed</Badge>
                      )}
                      {r.consent === 'OPTED_OUT' && (
                        <Badge className="border border-red-500/30 bg-red-500/15 text-[10px] text-red-500">STOP</Badge>
                      )}
                    </div>
                  </button>
                )
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="truncate text-base">
              {selectedRow ? selectedRow.title : selected ? 'Conversation' : 'Select a conversation'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selected ? (
              <SmsThread conversationId={selected} staff={staff} onChanged={load} />
            ) : (
              <div className="flex h-[560px] items-center justify-center text-sm text-muted-foreground">
                Pick a conversation from the list.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function MessagesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      }
    >
      <MessagesInbox />
    </Suspense>
  )
}
