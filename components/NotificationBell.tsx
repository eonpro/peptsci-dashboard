'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell,
  Package,
  CreditCard,
  Truck,
  Boxes,
  Building2,
  Info,
  Loader2,
  CheckCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

type Category = 'ORDER' | 'PAYMENT' | 'SHIPMENT' | 'INVENTORY' | 'CLIENT' | 'SYSTEM'

interface NotificationItem {
  id: string
  category: Category
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  title: string
  message: string
  actionUrl: string | null
  isRead: boolean
  createdAt: string
}

const CATEGORY_ICON: Record<Category, typeof Bell> = {
  ORDER: Package,
  PAYMENT: CreditCard,
  SHIPMENT: Truck,
  INVENTORY: Boxes,
  CLIENT: Building2,
  SYSTEM: Info,
}

const POLL_MS = 60_000

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export function NotificationBell() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(false)
  const [listError, setListError] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchUnread = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/notifications/unread-count', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as { count?: number }
      setUnread(data.count ?? 0)
    } catch {
      // Silent: badge polling should never surface errors.
    }
  }, [])

  const fetchList = useCallback(async () => {
    setLoading(true)
    setListError(false)
    try {
      const res = await fetch('/api/admin/notifications?pageSize=15', { cache: 'no-store' })
      if (!res.ok) {
        setListError(true)
        return
      }
      const data = (await res.json()) as { notifications?: NotificationItem[]; unreadCount?: number }
      setItems(data.notifications ?? [])
      if (typeof data.unreadCount === 'number') setUnread(data.unreadCount)
    } catch {
      setListError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  // Poll the unread badge.
  useEffect(() => {
    void fetchUnread()
    pollRef.current = setInterval(() => void fetchUnread(), POLL_MS)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [fetchUnread])

  // Load the list whenever the dropdown opens.
  useEffect(() => {
    if (open) void fetchList()
  }, [open, fetchList])

  const markAllRead = useCallback(async () => {
    setUnread(0)
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })))
    try {
      await fetch('/api/admin/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
    } catch {
      void fetchUnread()
    }
  }, [fetchUnread])

  const onItemClick = useCallback(
    async (n: NotificationItem) => {
      if (!n.isRead) {
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)))
        setUnread((u) => Math.max(0, u - 1))
        void fetch('/api/admin/notifications/mark-read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [n.id] }),
        }).catch(() => undefined)
      }
      if (n.actionUrl) {
        setOpen(false)
        router.push(n.actionUrl)
      }
    },
    [router]
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-white/70 hover:text-white hover:bg-white/10 relative"
          aria-label={unread > 0 ? `${unread} unread notifications` : 'Notifications'}
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-primary px-1 text-[10px] font-semibold text-white">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-96 max-w-[calc(100vw-1rem)] p-0 bg-brand-onyx border-[#0a0e3a] text-white"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <span className="text-sm font-semibold">Notifications</span>
          <button
            type="button"
            onClick={markAllRead}
            disabled={unread === 0}
            className="flex items-center gap-1 text-xs text-white/60 hover:text-white disabled:opacity-40 disabled:hover:text-white/60"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-white/50">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : listError && items.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-white/50">
              Couldn&apos;t load notifications.{' '}
              <button
                type="button"
                onClick={() => void fetchList()}
                className="text-brand-primary underline-offset-2 hover:underline"
              >
                Retry
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-white/50">
              You&apos;re all caught up.
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {items.map((n) => {
                const Icon = CATEGORY_ICON[n.category] ?? Info
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => onItemClick(n)}
                      className={cn(
                        'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5',
                        !n.isRead && 'bg-white/3'
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                          n.priority === 'URGENT' || n.priority === 'HIGH'
                            ? 'bg-red-500/15 text-red-300'
                            : 'bg-brand-primary/15 text-[#7c8cff]'
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{n.title}</span>
                          {!n.isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-primary" />}
                        </span>
                        <span className="mt-0.5 block text-xs text-white/60 line-clamp-2">{n.message}</span>
                        <span className="mt-1 block text-[11px] text-white/40">{timeAgo(n.createdAt)}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
