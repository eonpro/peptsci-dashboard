'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Send, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChatMessage {
  id: number
  from: 'assistant' | 'user'
  text: string
  at: Date
}

const GREETING =
  'Hi there, welcome to PeptSci. You\u2019re chatting with our concierge support — ask about products, orders, COAs, or your account pricing and a specialist will get right back to you.'

const fmtTime = (d: Date) =>
  d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })

/**
 * Floating concierge chat (Superpower-style): a squared logo launcher pinned
 * bottom-right that opens a dark chat panel. Messages ring the admin bell and
 * land in the support inbox with practice context; replies come by email.
 */
export function SupportChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const idRef = useRef(0)

  // Seed the greeting when first opened.
  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ id: idRef.current++, from: 'assistant', text: GREETING, at: new Date() }])
    }
  }, [open, messages.length])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, open])

  const send = async () => {
    const text = draft.trim()
    if (!text || sending) return
    setDraft('')
    setSending(true)
    setMessages((prev) => [...prev, { id: idRef.current++, from: 'user', text, at: new Date() }])
    try {
      const res = await fetch('/api/shop/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      setMessages((prev) => [
        ...prev,
        {
          id: idRef.current++,
          from: 'assistant',
          text: res.ok
            ? 'Got it — our team has been notified and will reply to your account email shortly.'
            : 'Sorry, that didn\u2019t go through. Please try again, or email support@peptsci.com.',
          at: new Date(),
        },
      ])
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: idRef.current++,
          from: 'assistant',
          text: 'Sorry, that didn\u2019t go through. Please try again, or email support@peptsci.com.',
          at: new Date(),
        },
      ])
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {/* Launcher — squared logo button, Superpower style */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close support chat' : 'Open support chat'}
        aria-expanded={open}
        className={cn(
          'fixed z-50 flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_10px_35px_-10px_rgba(0,0,0,0.8)] transition-transform hover:scale-105',
          'bottom-20 right-4 md:bottom-6 md:right-6'
        )}
      >
        {open ? (
          <X className="h-5 w-5 text-[#0a0e3a]" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/shop/peptsci-icon.png" alt="" className="h-7 w-7 object-contain" />
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          role="dialog"
          aria-label="PeptSci support chat"
          className="fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-white/12 bg-[#07092c] shadow-[0_30px_90px_-20px_rgba(0,0,0,0.9)] bottom-36 right-4 h-[min(560px,calc(100dvh-11rem))] w-[calc(100vw-2rem)] max-w-[400px] md:bottom-24 md:right-6"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <span className="text-sm font-semibold text-white">PeptSci Assistant</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="rounded-md p-1 text-white/50 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <p className="text-center text-[11px] text-white/30">{fmtTime(new Date())}</p>
            {messages.map((m) => (
              <div key={m.id} className={cn('flex gap-2.5', m.from === 'user' && 'justify-end')}>
                {m.from === 'assistant' && (
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-primary text-[11px] font-bold text-white">
                    P
                  </span>
                )}
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed',
                    m.from === 'assistant'
                      ? 'rounded-tl-md bg-white/8 text-white/85'
                      : 'rounded-tr-md bg-brand-primary text-white'
                  )}
                >
                  {m.text}
                </div>
              </div>
            ))}
          </div>

          {/* Composer */}
          <div className="border-t border-white/10 p-3">
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 pl-4 pr-1.5">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void send()
                  }
                }}
                placeholder="Start a conversation…"
                aria-label="Message"
                className="h-11 min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/35 outline-none"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={sending || !draft.trim()}
                aria-label="Send message"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-primary text-white transition-opacity disabled:opacity-40"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            <p className="mt-2 text-center text-[10px] text-white/25">
              Replies go to your account email
            </p>
          </div>
        </div>
      )}
    </>
  )
}
