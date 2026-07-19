'use client'

import { useState, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { getTotals, groupByProduct, groupByCustomer, getMonthOverMonthSales } from '@/lib/kpis'
import { ChartCard } from '@/components/ChartCard'
import {
  RefreshCw,
  Database,
  ChevronDown,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  Crown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SalesImportButton } from '@/components/admin/SalesImportButton'
import { StripeBackfillButton } from '@/components/admin/StripeBackfillButton'
import { OrdersBackfillButton } from '@/components/admin/OrdersBackfillButton'
import Link from 'next/link'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import GroupedRecentOrdersTable from './GroupedRecentOrdersTable'
import { PendingApprovals } from './PendingApprovals'
import { OpsQueues } from './OpsQueues'

// recharts is heavy (~100kB+). Load it only on the client, after the KPIs and
// shell have painted, so it never blocks first render of the dashboard.
const DashboardCharts = dynamic(() => import('./DashboardCharts'), {
  ssr: false,
  loading: () => (
    <div className="h-[320px] w-full animate-pulse rounded-2xl border border-white/10 bg-[#0a0e3a]/50" />
  ),
})
import type { Sale } from '@/lib/sales'
import { format } from 'date-fns'

type ApiSale = Omit<Sale, 'Date'> & { Date: string | Date | null }

/** Re-hydrate Date fields that arrive as strings from JSON/serialization. */
function withDates(data: ApiSale[]): Sale[] {
  return data.map((sale) => ({
    ...sale,
    Date: sale.Date ? new Date(sale.Date) : null,
  }))
}

export default function DashboardClient({ initialSales }: { initialSales: Sale[] }) {
  // Seed from server-rendered data so the first paint already shows KPIs/charts
  // (no skeleton, no client round trip). Refresh/polling keep it up to date.
  // Normalize the seed too: depending on serialization, Date fields can arrive
  // as strings, which would crash the `.getTime()` sort on first paint.
  const [sales, setSales] = useState<Sale[]>(() => withDates(initialSales))
  const [refreshing, setRefreshing] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)

  async function loadData(): Promise<boolean> {
    try {
      // The server caches parsed data briefly, so we no longer cache-bust on
      // every load. The manual Refresh button and the periodic refresh below
      // still pick up new data within the cache window.
      const response = await fetch('/api/sales')
      if (!response.ok) {
        throw new Error('Failed to fetch sales')
      }
      const data: ApiSale[] = await response.json()
      setSales(withDates(data))
      return true
    } catch (error) {
      console.error('Error fetching sales:', error)
      return false
    } finally {
      setRefreshing(false)
    }
  }

  // Live-ish updates: poll every 60s while the tab is visible, and refresh
  // immediately when the user returns to the tab. New Stripe payments are
  // ingested by the webhook the moment they succeed, so this keeps the KPIs
  // within a minute of real time. The /api/sales response is cached ~30s
  // server-side, which keeps this polling cheap.
  useEffect(() => {
    const REFRESH_MS = 60 * 1000
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadData()
      }
    }, REFRESH_MS)

    const onVisible = () => {
      if (document.visibilityState === 'visible') loadData()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    const ok = await loadData()
    if (ok) toast.success('Sales data refreshed')
    else toast.error('Could not refresh sales data. Please try again.')
  }

  const currentMonth = useMemo(() => format(new Date(), 'MMMM'), [])

  // All of these are O(n) scans/sorts over the full sales history. Memoize on
  // `sales` so they don't re-run on every render (refresh spinner, polling, etc).
  const kpis = useMemo(() => getTotals(sales), [sales])
  const productMetrics = useMemo(() => groupByProduct(sales), [sales])
  const customerMetrics = useMemo(() => groupByCustomer(sales), [sales])
  const monthOverMonthData = useMemo(() => getMonthOverMonthSales(sales), [sales])

  // MTD pace vs the whole of last month — a rough but honest "are we ahead"
  // signal for the hero.
  const mtdChange = useMemo(() => {
    if (monthOverMonthData.length < 2) return undefined
    const prev = monthOverMonthData[monthOverMonthData.length - 2]?.sales ?? 0
    if (prev <= 0) return undefined
    return Math.round(((kpis.mtdSales - prev) / prev) * 100)
  }, [monthOverMonthData, kpis.mtdSales])

  // Daily revenue for the last 30 days (zero-filled) — powers the hero
  // sparkline, plus the today / 7-day quick stats.
  const daily = useMemo(() => {
    const days = 30
    const buckets = new Map<string, number>()
    const now = new Date()
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(now.getDate() - i)
      buckets.set(format(d, 'yyyy-MM-dd'), 0)
    }
    for (const sale of sales) {
      if (!sale.Date) continue
      const key = format(sale.Date, 'yyyy-MM-dd')
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + sale.PaidAmount)
    }
    const series = Array.from(buckets, ([day, revenue]) => ({ day, revenue }))
    const today = series[series.length - 1]?.revenue ?? 0
    const last7 = series.slice(-7).reduce((s, d) => s + d.revenue, 0)
    return { series, today, last7 }
  }, [sales])

  // Orders placed this calendar month (unique order keys, mirrors getTotals).
  const mtdOrders = useMemo(() => {
    const monthKey = format(new Date(), 'yyyy-MM')
    const seen = new Set<string>()
    for (const sale of sales) {
      if (!sale.Date || format(sale.Date, 'yyyy-MM') !== monthKey) continue
      seen.add(sale.OrderID || `${sale.CustomerEmail}-${sale.Date.getTime()}`)
    }
    return seen.size
  }, [sales])

  const avgOrderValue = kpis.totalOrders > 0 ? kpis.totalSales / kpis.totalOrders : 0

  const usd = (n: number, digits = 0) =>
    n.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })

  const recentOrders = useMemo(
    () =>
      sales
        .filter((s) => s.Date)
        .sort((a, b) => {
          if (!a.Date || !b.Date) return 0
          return b.Date.getTime() - a.Date.getTime()
        })
        .slice(0, 20),
    [sales]
  )

  const topCustomers = useMemo(() => customerMetrics.slice(0, 10), [customerMetrics])

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Dashboard</h2>
          <p className="mt-0.5 text-sm text-white/50">
            {format(new Date(), 'EEEE, MMMM d')} · live view, refreshes every minute
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Data maintenance tools collapse behind one toggle so the daily
              header stays focused on the single action that matters: Refresh.
              (A plain disclosure, not a menu — the tool buttons own their
              dialogs and must stay mounted while a dialog is open.) */}
          <Button
            variant="outline"
            size="sm"
            aria-expanded={toolsOpen}
            onClick={() => setToolsOpen((v) => !v)}
            className="bg-[#0a0e3a] border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <Database className="mr-2 h-4 w-4" />
            Data tools
            <ChevronDown
              className={cn('ml-1.5 h-3.5 w-3.5 transition-transform', toolsOpen && 'rotate-180')}
            />
          </Button>
          <Button
            onClick={handleRefresh}
            variant="outline"
            size="sm"
            disabled={refreshing}
            className="bg-[#0a0e3a] border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {toolsOpen && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-[#0a0e3a]/50 p-3">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-white/40">
            Imports & backfills
          </span>
          <SalesImportButton />
          <OrdersBackfillButton />
          <StripeBackfillButton />
        </div>
      )}

      {/* New accounts awaiting approval (hidden when none) */}
      <PendingApprovals />

      {/* ── Hero: this month at a glance ─────────────────────────────── */}
      <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-linear-to-br from-brand-primary via-[#1b31c4] to-[#0a0e3a] p-6 shadow-[0_30px_80px_-40px_rgba(33,60,239,0.9)] md:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_50%)]" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-white/10 blur-3xl" />

        <div className="relative z-10 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
              Revenue · {currentMonth}
            </p>
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <span className="text-5xl font-bold tracking-tight text-white md:text-6xl">
                {usd(kpis.mtdSales)}
              </span>
              {mtdChange !== undefined && (
                <span
                  className={cn(
                    'mb-1.5 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold',
                    mtdChange >= 0 ? 'bg-emerald-400/20 text-emerald-200' : 'bg-red-400/20 text-red-200'
                  )}
                >
                  {mtdChange >= 0 ? (
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowDownRight className="h-3.5 w-3.5" />
                  )}
                  {Math.abs(mtdChange)}% vs last month
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-white/60">
              {usd(kpis.totalSales)} all-time · {kpis.totalOrders.toLocaleString()} orders ·{' '}
              {kpis.uniqueClients.toLocaleString()} clients
            </p>

            <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
              {[
                { label: 'Today', value: usd(daily.today) },
                { label: 'Last 7 days', value: usd(daily.last7) },
                { label: `Orders · ${currentMonth}`, value: mtdOrders.toLocaleString() },
                { label: 'Avg order', value: usd(avgOrderValue) },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm"
                >
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-white/55">
                    {s.label}
                  </dt>
                  <dd className="mt-0.5 text-xl font-bold text-white">{s.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="min-w-0">
            <p className="mb-1 text-right text-[11px] font-semibold uppercase tracking-wide text-white/50">
              Daily revenue · last 30 days
            </p>
            <DashboardCharts
              type="sparkline"
              data={daily.series}
              dataKey="revenue"
              xKey="day"
              height={190}
            />
          </div>
        </div>
      </section>

      {/* ── Main + rail ──────────────────────────────────────────────── */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <ChartCard
            title="Month over Month Sales"
            description="Revenue trend across the trailing months"
            className="w-full"
          >
            <DashboardCharts
              type="line"
              data={monthOverMonthData.map((d) => ({ month: d.month, sales: d.sales }))}
              dataKey="sales"
              xKey="month"
              height={360}
            />
          </ChartCard>

          {/* Top products as a ranked list — denser and more legible than a pie */}
          <ChartCard title="Top Products" description="Share of all-time revenue">
            <RankedBars
              items={productMetrics.slice(0, 6).map((p) => ({
                name: p.product,
                value: p.totalRevenue,
                sub: `${p.totalVials.toLocaleString()} vials`,
              }))}
              format={usd}
            />
          </ChartCard>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold text-white">Recent Orders</h3>
              <Link
                href="/fulfillment"
                className="inline-flex items-center gap-1 text-sm text-white/60 transition-colors hover:text-white"
              >
                Open fulfillment <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <GroupedRecentOrdersTable data={recentOrders} />
          </div>
        </div>

        {/* Right rail: action queues + best customers */}
        <aside className="min-w-0 space-y-6">
          <div className="rounded-[28px] border border-white/10 bg-[#0a0e3a]/60 p-5">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/60">
              Needs attention
            </h3>
            <OpsQueues variant="rail" />
          </div>

          <div className="rounded-[28px] border border-white/10 bg-[#0a0e3a]/60 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-white/60">
                <Crown className="h-4 w-4 text-amber-300" /> Top customers
              </h3>
              <Link href="/customers" className="text-xs text-white/50 hover:text-white">
                View all
              </Link>
            </div>
            <ol className="space-y-1">
              {topCustomers.slice(0, 8).map((c, i) => (
                <li key={`${c.email || c.name}-${i}`}>
                  <Link
                    href={`/customers/${encodeURIComponent(c.email || c.name)}`}
                    className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/5"
                  >
                    <span
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                        i === 0
                          ? 'bg-amber-400/20 text-amber-300'
                          : i < 3
                            ? 'bg-brand-primary/25 text-[#9daaff]'
                            : 'bg-white/5 text-white/40'
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-white">
                        {c.name}
                      </span>
                      <span className="block text-xs text-white/40">
                        {c.totalOrders} order{c.totalOrders === 1 ? '' : 's'}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-white/80">
                      {usd(c.lifetimeSpend)}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  )
}

/** Horizontal ranked bars (pure CSS) — replaces the old pie/bar charts. */
function RankedBars({
  items,
  format,
}: {
  items: { name: string; value: number; sub?: string }[]
  format: (n: number) => string
}) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.name}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium text-white">{item.name}</span>
            <span className="shrink-0 font-semibold text-white/80">
              {format(item.value)}
              {item.sub && <span className="ml-2 text-xs font-normal text-white/40">{item.sub}</span>}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-linear-to-r from-brand-primary to-[#7b8cff]"
              style={{ width: `${Math.max(2, Math.round((item.value / max) * 100))}%` }}
            />
          </div>
        </div>
      ))}
      {items.length === 0 && <p className="py-6 text-center text-sm text-white/40">No data yet.</p>}
    </div>
  )
}
