'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BarChart3, Loader2, Download, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const usd2 = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

type Report = {
  range: { start: string; end: string; days: number }
  revenue: { revenue: number; cogs: number; profit: number; marginPct: number; units: number; orders: number }
  previousRevenue: { revenue: number }
  forecastRevenue: number
  topProducts: { product: string; revenue: number; profit: number; units: number; orders: number }[]
  ar: {
    current: number
    net30: number
    net60: number
    net90: number
    over90: number
    total: number
    invoiceCount: number
    overdueCount: number
  }
  sla: {
    totalOrders: number
    shippedOrders: number
    unshippedOrders: number
    avgHoursToShip: number
    medianHoursToShip: number
    withinSlaPct: number
    slaHours: number
  }
  lowStock: {
    summary: { lowCount: number; outCount: number; okCount: number }
    items: { sku: string | null; productName: string; dose: string | null; onHand: number; reserved: number; available: number; reorderLevel: number }[]
  }
}

const RANGES = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '1y', days: 365 },
]

export default function ReportsPage() {
  const [days, setDays] = useState(30)
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/admin/reports?days=${days}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.message || data.error || 'Failed to load reports')
        return data
      })
      .then((data) => setReport(data.report))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load reports'))
      .finally(() => setLoading(false))
  }, [days])

  useEffect(() => {
    load()
  }, [load])

  const delta = report
    ? report.previousRevenue.revenue > 0
      ? ((report.revenue.revenue - report.previousRevenue.revenue) / report.previousRevenue.revenue) * 100
      : null
    : null

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <BarChart3 className="h-6 w-6" /> Reports
          </h1>
          <p className="mt-1 text-sm text-white/60">
            Revenue, accounts receivable, fulfillment SLA, and inventory health.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg border border-white/10 p-1">
            {RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => setDays(r.days)}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  days === r.days ? 'bg-brand-primary text-white' : 'text-white/60 hover:text-white'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <ExportButton type="sales" label="Sales CSV" />
        <ExportButton type="inventory" label="Inventory CSV" />
        <ExportButton type="ar" label="AR Aging CSV" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-white/60">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : error ? (
        <p className="py-8 text-center text-red-400">{error}</p>
      ) : !report ? null : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi
              label={`Revenue (${days}d)`}
              value={usd(report.revenue.revenue)}
              sub={
                delta == null ? undefined : (
                  <span className={delta >= 0 ? 'text-emerald-300' : 'text-red-300'}>
                    {delta >= 0 ? <TrendingUp className="inline h-3 w-3" /> : <TrendingDown className="inline h-3 w-3" />}{' '}
                    {Math.abs(delta).toFixed(1)}% vs prior
                  </span>
                )
              }
            />
            <Kpi label="Profit" value={usd(report.revenue.profit)} sub={`${report.revenue.marginPct.toFixed(1)}% margin`} />
            <Kpi label="Orders / Units" value={`${report.revenue.orders} / ${report.revenue.units}`} />
            <Kpi
              label="Forecast (next mo.)"
              value={usd(report.forecastRevenue)}
              sub="moving avg + trend"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Accounts receivable aging</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-3 flex items-baseline justify-between">
                  <span className="text-sm text-white/60">{report.ar.invoiceCount} open invoice(s)</span>
                  <span className="text-xl font-bold text-white">{usd2(report.ar.total)}</span>
                </div>
                <AgingBar ar={report.ar} />
                <div className="mt-3 grid grid-cols-5 gap-2 text-center text-xs">
                  <AgingCell label="Current" value={report.ar.current} tone="text-emerald-300" />
                  <AgingCell label="1–30" value={report.ar.net30} tone="text-amber-300" />
                  <AgingCell label="31–60" value={report.ar.net60} tone="text-orange-300" />
                  <AgingCell label="61–90" value={report.ar.net90} tone="text-red-300" />
                  <AgingCell label="90+" value={report.ar.over90} tone="text-red-400" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Fulfillment SLA ({report.sla.slaHours}h)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Line label="Orders in range" value={String(report.sla.totalOrders)} />
                <Line label="Shipped" value={`${report.sla.shippedOrders} (${report.sla.unshippedOrders} pending)`} />
                <Line label="Avg time to ship" value={`${report.sla.avgHoursToShip.toFixed(1)} h`} />
                <Line label="Median time to ship" value={`${report.sla.medianHoursToShip.toFixed(1)} h`} />
                <div className="flex items-center justify-between border-t border-white/10 pt-2">
                  <span className="text-white/60">Within SLA</span>
                  <span className={`font-bold ${report.sla.withinSlaPct >= 90 ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {report.sla.withinSlaPct.toFixed(1)}%
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top products</CardTitle>
              </CardHeader>
              <CardContent>
                {report.topProducts.length === 0 ? (
                  <p className="py-4 text-sm text-white/50">No sales in this range.</p>
                ) : (
                  <div className="divide-y divide-white/5">
                    {report.topProducts.map((p) => (
                      <div key={p.product} className="flex items-center justify-between py-2 text-sm">
                        <span className="min-w-0 truncate text-white">{p.product}</span>
                        <span className="ml-3 shrink-0 text-white/70">
                          {usd(p.revenue)} · {p.units}u
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-amber-300" /> Low / out of stock
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-sm text-white/60">
                  {report.lowStock.summary.outCount} out · {report.lowStock.summary.lowCount} low ·{' '}
                  {report.lowStock.summary.okCount} ok
                </p>
                {report.lowStock.items.length === 0 ? (
                  <p className="py-2 text-sm text-emerald-300">All stock above reorder levels.</p>
                ) : (
                  <div className="max-h-64 divide-y divide-white/5 overflow-y-auto">
                    {report.lowStock.items.map((it, i) => (
                      <div key={`${it.sku}-${i}`} className="flex items-center justify-between py-2 text-sm">
                        <span className="min-w-0 truncate text-white">
                          {it.productName}
                          {it.dose ? ` · ${it.dose}` : ''}
                        </span>
                        <span className={`ml-3 shrink-0 ${it.available <= 0 ? 'text-red-400' : 'text-amber-300'}`}>
                          {it.available} / {it.reorderLevel}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-white/50">{label}</p>
        <p className="mt-1 text-2xl font-bold text-white">{value}</p>
        {sub && <p className="mt-1 text-xs text-white/50">{sub}</p>}
      </CardContent>
    </Card>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-white/60">{label}</span>
      <span className="text-white">{value}</span>
    </div>
  )
}

function AgingCell({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <p className="text-white/40">{label}</p>
      <p className={`font-semibold ${tone}`}>{usd(value)}</p>
    </div>
  )
}

function AgingBar({ ar }: { ar: Report['ar'] }) {
  const total = ar.total || 1
  const segs: Array<{ v: number; c: string }> = [
    { v: ar.current, c: 'bg-emerald-500' },
    { v: ar.net30, c: 'bg-amber-500' },
    { v: ar.net60, c: 'bg-orange-500' },
    { v: ar.net90, c: 'bg-red-500' },
    { v: ar.over90, c: 'bg-red-700' },
  ]
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/5">
      {segs.map((s, i) => (
        <div key={i} className={s.c} style={{ width: `${(s.v / total) * 100}%` }} />
      ))}
    </div>
  )
}

function ExportButton({ type, label }: { type: string; label: string }) {
  return (
    <Button size="sm" variant="outline" asChild>
      <a href={`/api/admin/reports/export?type=${type}`} target="_blank" rel="noopener noreferrer">
        <Download className="mr-2 h-4 w-4" /> {label}
      </a>
    </Button>
  )
}
