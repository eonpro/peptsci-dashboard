'use client'

/**
 * One SMS conversation: CRM header (practice, contact, consent, assignee,
 * status), the two-way message timeline (automated texts, staff replies and
 * the contact's replies), and a composer that sends through the PeptSci
 * Alerts Messaging Service. Polls every 15s while visible (no WebSockets).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  Link2,
  Loader2,
  MessagesSquare,
  Phone,
  RotateCcw,
  SendHorizonal,
  UserRound,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SMS_MAX_REPLY_LENGTH, smsSegmentInfo } from '@/lib/sms/inbox-utils'
import { SMS_PROGRAM_NAME, SMS_SENDER_DISPLAY } from '@/lib/sms/program'

export interface StaffRef {
  id: string
  name: string
}

export interface ThreadMessage {
  id: string
  direction: string
  kind: string
  body: string
  status: string
  errorCode: string | null
  errorMessage: string | null
  sentBy: StaffRef | null
  orderId: string | null
  orderNumber: number | null
  createdAt: string
  deliveredAt: string | null
}

export interface ConversationDetail {
  id: string
  phone: string
  phoneDisplay: string
  contactName: string | null
  title: string
  status: string
  assignedTo: StaffRef | null
  unreadCount: number
  consent: 'SUBSCRIBED' | 'OPTED_OUT' | 'UNKNOWN'
  client: {
    id: string
    organizationName: string
    contactName: string | null
    contactEmail: string | null
    contactPhone: string | null
    smsOptIn: boolean
  } | null
  subscriber: { consentedAt: string | null; optedOutAt: string | null; source: string } | null
  closedAt: string | null
  closedBy: StaffRef | null
  messages: ThreadMessage[]
}

const POLL_MS = 15_000
const UNASSIGNED = '__none__'

const CONSENT_STYLE: Record<ConversationDetail['consent'], { label: string; className: string }> = {
  SUBSCRIBED: { label: 'Subscribed', className: 'bg-green-500/15 text-green-600 border border-green-500/30' },
  OPTED_OUT: { label: 'Opted out (STOP)', className: 'bg-red-500/15 text-red-500 border border-red-500/30' },
  UNKNOWN: { label: 'No consent on file', className: 'bg-amber-500/15 text-amber-600 border border-amber-500/30' },
}

const KIND_LABEL: Record<string, string> = {
  ORDER_SHIPPED: 'Shipping update',
  ORDER_DELIVERED: 'Delivery update',
  ORDER_EXCEPTION: 'Delivery exception',
  INVOICE_OVERDUE: 'Invoice reminder',
  OPT_IN_CONFIRMATION: 'Opt-in confirmation',
  STAFF_REPLY: 'Reply',
  KEYWORD_STOP: 'STOP keyword',
  KEYWORD_START: 'START keyword',
  KEYWORD_HELP: 'HELP keyword',
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const today = new Date().toDateString() === d.toDateString()
  return today
    ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return 'Today'
  const y = new Date(now)
  y.setDate(now.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function DeliveryMark({ m }: { m: ThreadMessage }) {
  if (m.direction !== 'OUTBOUND') return null
  switch (m.status) {
    case 'DELIVERED':
      return <CheckCheck className="h-3 w-3" aria-label="Delivered" />
    case 'SENT':
      return <Check className="h-3 w-3" aria-label="Sent" />
    case 'QUEUED':
      return <Clock className="h-3 w-3" aria-label="Queued" />
    case 'FAILED':
    case 'UNDELIVERED':
    case 'SKIPPED':
      return <AlertTriangle className="h-3 w-3 text-red-300" aria-label={m.status} />
    default:
      return null
  }
}

interface ClientHit {
  id: string
  organizationName: string
  contactName: string | null
  contactPhone: string | null
}

export function SmsThread({
  conversationId,
  staff,
  onChanged,
}: {
  conversationId: string
  staff: StaffRef[]
  /** Called after any change so the list can refresh unread/status/assignee. */
  onChanged?: () => void
}) {
  const [convo, setConvo] = useState<ConversationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [busy, setBusy] = useState(false)
  const [linking, setLinking] = useState(false)
  const [clientQuery, setClientQuery] = useState('')
  const [clientHits, setClientHits] = useState<ClientHit[]>([])
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const onChangedRef = useRef(onChanged)
  onChangedRef.current = onChanged

  const base = `/api/admin/messages/conversations/${conversationId}`

  const load = useCallback(async () => {
    try {
      const res = await fetch(base)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.message || 'Could not load this conversation.')
        return
      }
      setConvo(data.conversation)
      setError(null)
      onChangedRef.current?.()
    } catch {
      // transient poll failure — keep the last thread on screen
    } finally {
      setLoading(false)
    }
  }, [base])

  useEffect(() => {
    setLoading(true)
    setConvo(null)
    setDraft('')
    setLinking(false)
    setEditingName(false)
    load()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [load])

  const messageCount = convo?.messages.length ?? 0
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messageCount, conversationId])

  // Clinic picker search (debounced).
  useEffect(() => {
    if (!linking) return
    const q = clientQuery.trim()
    if (q.length < 2) {
      setClientHits([])
      return
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/admin/messages/clients?q=${encodeURIComponent(q)}`)
      const data = await res.json().catch(() => ({}))
      if (res.ok) setClientHits(data.clients ?? [])
    }, 250)
    return () => clearTimeout(t)
  }, [clientQuery, linking])

  const patch = async (body: Record<string, unknown>, okMessage?: string) => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(base, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.message || 'Could not update the conversation.')
        return
      }
      setConvo(data.conversation)
      if (okMessage) toast.success(okMessage)
      onChangedRef.current?.()
    } finally {
      setBusy(false)
    }
  }

  const send = async () => {
    const body = draft.trim()
    if (!body || sending || !convo) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`${base}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.message || data.error || 'Could not send the text.')
        return
      }
      setDraft('')
      if (data.conversation) setConvo(data.conversation)
      onChangedRef.current?.()
    } catch {
      setError('Could not send the text. Check your connection and try again.')
    } finally {
      setSending(false)
    }
  }

  const segments = useMemo(() => smsSegmentInfo(draft), [draft])
  const optedOut = convo?.consent === 'OPTED_OUT'

  if (loading && !convo) {
    return (
      <div className="flex h-[560px] items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }
  if (!convo) {
    return (
      <div className="flex h-[560px] items-center justify-center text-sm text-red-400">
        {error || 'Conversation not found.'}
      </div>
    )
  }

  const consent = CONSENT_STYLE[convo.consent]

  return (
    <div className="flex h-[560px] flex-col">
      {/* CRM header */}
      <div className="border-b border-border pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {convo.client ? (
                <Link
                  href={`/clients/${convo.client.id}?tab=texts`}
                  className="flex items-center gap-1.5 text-base font-semibold hover:underline"
                >
                  <Building2 className="h-4 w-4 text-brand-primary" />
                  {convo.client.organizationName}
                </Link>
              ) : editingName ? (
                <form
                  className="flex items-center gap-1"
                  onSubmit={(e) => {
                    e.preventDefault()
                    setEditingName(false)
                    void patch({ contactName: nameDraft.trim() || null }, 'Contact label saved.')
                  }}
                >
                  <Input
                    autoFocus
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    placeholder="Contact name"
                    className="h-8 w-48"
                    maxLength={120}
                  />
                  <Button type="submit" size="sm" variant="ghost" className="h-8 px-2">
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2"
                    onClick={() => setEditingName(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </form>
              ) : (
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-base font-semibold hover:underline"
                  onClick={() => {
                    setNameDraft(convo.contactName ?? '')
                    setEditingName(true)
                  }}
                  title="Set a contact label"
                >
                  <UserRound className="h-4 w-4 text-muted-foreground" />
                  {convo.contactName || 'Unknown contact'}
                </button>
              )}
              <Badge className={`${consent.className} text-[10px]`}>{consent.label}</Badge>
              {convo.status === 'CLOSED' && (
                <Badge className="bg-muted text-muted-foreground text-[10px]">Closed</Badge>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" /> {convo.phoneDisplay}
              </span>
              {convo.client?.contactName && <span>{convo.client.contactName}</span>}
              {convo.client?.contactEmail && <span>{convo.client.contactEmail}</span>}
              {convo.subscriber?.consentedAt && !convo.subscriber.optedOutAt && (
                <span>
                  Consent {new Date(convo.subscriber.consentedAt).toLocaleDateString()} ·{' '}
                  {convo.subscriber.source.replace(/_/g, ' ').toLowerCase()}
                </span>
              )}
              {convo.subscriber?.optedOutAt && (
                <span>STOP received {new Date(convo.subscriber.optedOutAt).toLocaleDateString()}</span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={convo.assignedTo?.id ?? UNASSIGNED}
              onValueChange={(v) => patch({ assignedToId: v === UNASSIGNED ? null : v })}
              disabled={busy}
            >
              <SelectTrigger className="h-8 w-[170px] text-xs">
                <SelectValue placeholder="Assign…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={busy}
              onClick={() => {
                setLinking((v) => !v)
                setClientQuery('')
                setClientHits([])
              }}
            >
              <Link2 className="mr-1 h-3.5 w-3.5" /> {convo.client ? 'Re-link clinic' : 'Link clinic'}
            </Button>
            {convo.status === 'CLOSED' ? (
              <Button size="sm" variant="outline" className="h-8" disabled={busy} onClick={() => patch({ status: 'OPEN' }, 'Conversation reopened.')}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reopen
              </Button>
            ) : (
              <Button size="sm" className="h-8" disabled={busy} onClick={() => patch({ status: 'CLOSED' }, 'Conversation closed.')}>
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Close
              </Button>
            )}
          </div>
        </div>

        {linking && (
          <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                value={clientQuery}
                onChange={(e) => setClientQuery(e.target.value)}
                placeholder="Search clinics by name, contact, email or phone…"
                className="h-8"
              />
              {convo.client && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  onClick={() => {
                    setLinking(false)
                    void patch({ clientId: null }, 'Clinic unlinked.')
                  }}
                >
                  Unlink
                </Button>
              )}
            </div>
            {clientHits.length > 0 && (
              <ul className="mt-2 max-h-40 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-card">
                {clientHits.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => {
                        setLinking(false)
                        void patch({ clientId: c.id }, `Linked to ${c.organizationName}.`)
                      }}
                    >
                      <span className="truncate font-medium">{c.organizationName}</span>
                      <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                        {[c.contactName, c.contactPhone].filter(Boolean).join(' · ')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Timeline */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto py-3 pr-1"
        aria-live="polite"
        aria-label="Text message thread"
      >
        {convo.messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <MessagesSquare className="mb-2 h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No messages yet</p>
          </div>
        ) : (
          convo.messages.map((m, i) => {
            const mine = m.direction === 'OUTBOUND'
            const prev = convo.messages[i - 1]
            const showDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt)
            const failed = ['FAILED', 'UNDELIVERED', 'SKIPPED'].includes(m.status)
            const who = mine
              ? m.sentBy?.name ?? (m.kind === 'STAFF_REPLY' ? 'PeptSci' : 'PeptSci Alerts')
              : convo.client?.contactName || convo.contactName || convo.phoneDisplay
            const kindLabel = KIND_LABEL[m.kind]
            return (
              <div key={m.id}>
                {showDay && (
                  <div className="my-2 flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                    <span className="h-px flex-1 bg-border" />
                    {dayLabel(m.createdAt)}
                    <span className="h-px flex-1 bg-border" />
                  </div>
                )}
                <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${
                      mine
                        ? failed
                          ? 'rounded-br-md border border-red-500/40 bg-red-500/10 text-foreground'
                          : 'rounded-br-md bg-brand-primary/80 text-white'
                        : 'rounded-bl-md bg-muted text-foreground'
                    }`}
                  >
                    <div className="mb-0.5 flex items-baseline gap-2">
                      <span className={`text-xs font-medium ${mine && !failed ? 'text-white/80' : 'text-foreground/80'}`}>
                        {who}
                        {kindLabel && (
                          <span className={`font-normal ${mine && !failed ? 'text-white/50' : 'text-muted-foreground'}`}>
                            {' '}
                            · {kindLabel}
                            {m.orderNumber ? ` · #${m.orderNumber}` : ''}
                          </span>
                        )}
                      </span>
                      <span
                        className={`flex items-center gap-1 text-[10px] ${
                          mine && !failed ? 'text-white/50' : 'text-muted-foreground'
                        }`}
                      >
                        {formatTime(m.createdAt)}
                        <DeliveryMark m={m} />
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    {failed && (
                      <p className="mt-1 text-[11px] text-red-400">
                        {m.status === 'SKIPPED' ? 'Not sent' : 'Delivery failed'}
                        {m.errorMessage ? ` — ${m.errorMessage}` : m.errorCode ? ` (${m.errorCode})` : ''}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {error && (
        <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">{error}</div>
      )}

      {/* Composer */}
      {optedOut ? (
        <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600">
          This number replied <strong>STOP</strong>. We can&rsquo;t text them until they send <strong>START</strong>{' '}
          to {SMS_SENDER_DISPLAY}. Reach out by email or phone instead.
        </div>
      ) : (
        <div className="mt-3">
          <div className="flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder={`Text ${convo.client?.organizationName || convo.contactName || convo.phoneDisplay}…`}
              rows={2}
              maxLength={SMS_MAX_REPLY_LENGTH}
              className="resize-none rounded-xl"
            />
            <Button
              onClick={send}
              disabled={sending || !draft.trim()}
              size="icon"
              aria-label="Send text"
              className="h-10 w-10 shrink-0 rounded-xl bg-brand-primary text-white hover:bg-[#1a30c0]"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
            </Button>
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>
              Sent from {SMS_SENDER_DISPLAY} · {SMS_PROGRAM_NAME} · Enter to send, Shift+Enter for a new line
            </span>
            <span>
              {segments.chars}/{SMS_MAX_REPLY_LENGTH}
              {segments.segments > 1 ? ` · ${segments.segments} segments` : ''}
              {segments.unicode ? ' · unicode' : ''}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
