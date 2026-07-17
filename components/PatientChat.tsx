'use client'

/**
 * Two-way patient message thread between a clinic and PeptSci staff.
 *
 * Shared by both sides — the viewer's role decides which endpoint family is
 * used and which bubbles render as "mine" (right-aligned):
 *   - CLINIC  → /api/shop/patients/[id]/messages
 *   - PEPTSCI → /api/admin/patients/[id]/messages
 *
 * No WebSocket infra exists in this app, so the thread polls every 15s while
 * mounted (mirrors the notification bell's polling approach).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, SendHorizonal, MessagesSquare } from 'lucide-react'

interface ChatMessage {
  id: string
  senderName: string
  senderRole: 'CLINIC' | 'PEPTSCI'
  body: string
  createdAt: string
}

const POLL_MS = 15_000

function formatTime(iso: string): string {
  const d = new Date(iso)
  const today = new Date().toDateString() === d.toDateString()
  return today
    ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
}

export function PatientChat({
  patientId,
  viewerRole,
  onRead,
}: {
  patientId: string
  /** Which side of the conversation the current user is on. */
  viewerRole: 'CLINIC' | 'PEPTSCI'
  /** Called after the thread loads (server marks the other side read). */
  onRead?: () => void
}) {
  const base =
    viewerRole === 'CLINIC' ? `/api/shop/patients/${patientId}` : `/api/admin/patients/${patientId}`

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const onReadRef = useRef(onRead)
  onReadRef.current = onRead

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${base}/messages`)
      if (!res.ok) return
      const data = await res.json()
      setMessages(data.messages ?? [])
      onReadRef.current?.()
    } catch {
      // transient poll failure — keep showing the last thread
    } finally {
      setLoading(false)
    }
  }, [base])

  useEffect(() => {
    load()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [load])

  // Keep the newest message in view whenever the thread grows.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages.length])

  const send = async () => {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`${base}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.message || data.error || 'Could not send the message. Please try again.')
        return
      }
      setDraft('')
      if (data.message) setMessages((prev) => [...prev, data.message])
    } catch {
      setError('Could not send the message. Please check your connection and try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col h-[420px]">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-3 pr-1"
        aria-live="polite"
        aria-label="Message thread"
      >
        {loading ? (
          <div className="flex items-center justify-center h-full text-white/40">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessagesSquare className="h-10 w-10 text-white/20 mb-2" />
            <p className="text-white/50 text-sm">No messages yet</p>
            <p className="text-white/30 text-xs mt-1">
              {viewerRole === 'CLINIC'
                ? 'Send a message to the PeptSci team about this patient.'
                : 'Send a message to the clinic about this patient.'}
            </p>
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.senderRole === viewerRole
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${
                    mine
                      ? 'bg-brand-primary/80 text-white rounded-br-md'
                      : 'bg-white/10 text-white rounded-bl-md'
                  }`}
                >
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className="text-xs font-medium text-white/80">
                      {mine ? 'You' : m.senderName}
                      {!mine && (
                        <span className="text-white/40 font-normal">
                          {' '}
                          · {m.senderRole === 'PEPTSCI' ? 'PeptSci' : 'Clinic'}
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] text-white/40">{formatTime(m.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                </div>
              </div>
            )
          })
        )}
      </div>

      {error && (
        <div className="mt-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs p-2">
          {error}
        </div>
      )}

      <div className="mt-3 flex items-end gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder="Type a message…"
          rows={2}
          maxLength={4000}
          className="resize-none bg-white/5 border-white/10 text-white rounded-xl placeholder:text-white/30"
        />
        <Button
          onClick={send}
          disabled={sending || !draft.trim()}
          size="icon"
          aria-label="Send message"
          className="h-10 w-10 shrink-0 bg-brand-primary hover:bg-[#1a30c0] text-white rounded-xl"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <SendHorizonal className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  )
}
