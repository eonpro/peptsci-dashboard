'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  Truck,
  Zap,
  CreditCard,
  Boxes,
  ReceiptText,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react'

interface OpsSummary {
  windowDays: number
  needsFulfillment: number
  stripeQueue: number
  unpaidOrders: number
  lowStock: number
  overdueInvoices: number
  openReturns: number
  pendingClients: number
}

interface QueueDef {
  key: keyof Omit<OpsSummary, 'windowDays'>
  label: string
  href: string
  icon: LucideIcon
  /** Tone when the count is > 0. Zero always renders quiet. */
  tone: 'amber' | 'red' | 'sky'
}

const QUEUES: QueueDef[] = [
  { key: 'needsFulfillment', label: 'Awaiting shipment', href: '/fulfillment', icon: Truck, tone: 'amber' },
  { key: 'stripeQueue', label: 'Stripe to convert', href: '/fulfillment?tab=stripe', icon: Zap, tone: 'amber' },
  { key: 'unpaidOrders', label: 'Unpaid orders', href: '/fulfillment', icon: CreditCard, tone: 'red' },
  { key: 'overdueInvoices', label: 'Overdue invoices', href: '/invoices?status=OVERDUE', icon: ReceiptText, tone: 'red' },
  { key: 'lowStock', label: 'Low stock', href: '/inventory', icon: Boxes, tone: 'amber' },
  { key: 'openReturns', label: 'Open returns', href: '/returns', icon: RotateCcw, tone: 'sky' },
]

const TONE_ACTIVE: Record<QueueDef['tone'], string> = {
  amber: 'border-amber-400/40 bg-amber-400/10 text-amber-300',
  red: 'border-red-400/40 bg-red-400/10 text-red-300',
  sky: 'border-sky-400/40 bg-sky-400/10 text-sky-300',
}

/**
 * "What needs me right now": live operational counts, each card deep-linking
 * to the surface where the work gets done. Counts refresh on a 60s poll while
 * the tab is visible. `variant="rail"` renders a vertical list for sidebars.
 */
export function OpsQueues({ variant = 'grid' }: { variant?: 'grid' | 'rail' }) {
  const [ops, setOps] = useState<OpsSummary | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = () =>
      fetch('/api/admin/dashboard/ops')
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!cancelled && data && typeof data.needsFulfillment === 'number') setOps(data)
        })
        .catch(() => {})
    load()
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, 60_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  if (variant === 'rail') {
    return (
      <div className="space-y-2">
        {QUEUES.map(({ key, label, href, icon: Icon, tone }) => {
          const count = ops?.[key]
          const active = typeof count === 'number' && count > 0
          return (
            <Link
              key={key}
              href={href}
              className={cn(
                'flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors',
                active
                  ? TONE_ACTIVE[tone]
                  : 'border-white/10 bg-white/[0.02] text-white/40 hover:bg-white/5'
              )}
            >
              <span className="flex min-w-0 items-center gap-3">
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate text-sm font-medium">{label}</span>
              </span>
              <span
                className={cn(
                  'flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full px-2 text-sm font-bold',
                  active ? 'bg-white/10' : 'bg-white/5'
                )}
              >
                {ops ? count : '–'}
              </span>
            </Link>
          )
        })}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {QUEUES.map(({ key, label, href, icon: Icon, tone }) => {
        const count = ops?.[key]
        const active = typeof count === 'number' && count > 0
        return (
          <Link
            key={key}
            href={href}
            className={cn(
              'group flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
              active
                ? TONE_ACTIVE[tone]
                : 'border-white/10 bg-[#0a0e3a]/50 text-white/40 hover:bg-white/5'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-lg font-bold leading-tight">
                {ops ? count : '–'}
              </span>
              <span className="block truncate text-[11px] font-medium uppercase tracking-wide opacity-80">
                {label}
              </span>
            </span>
          </Link>
        )
      })}
    </div>
  )
}
