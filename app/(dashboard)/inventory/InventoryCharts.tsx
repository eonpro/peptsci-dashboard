'use client'

/**
 * Analytics section for the Inventory workspace. Loaded lazily (next/dynamic,
 * ssr:false) so recharts stays out of the page's initial bundle. Fed entirely
 * by the summary endpoint — switching the window re-fetches via the parent.
 */

import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TooltipProps } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  type InventorySummaryPayload,
  REASON_LABELS,
  budLabel,
  budTone,
  fmtDate,
} from './inventory-shared'

const INBOUND_COLOR = '#34d399' // emerald-400
const OUTBOUND_COLOR = '#fb7185' // rose-400
const STOCK_COLOR = '#213cef' // PEPTSCI brand blue
const RESERVED_COLOR = '#60a5fa' // blue-400

const tickColor = 'rgba(148, 163, 184, 0.8)'

function fmtDayTick(value: string): string {
  const d = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-xl border bg-popover px-3 py-2 text-popover-foreground shadow-lg">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {typeof label === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(label)
          ? fmtDayTick(label)
          : String(label)}
      </p>
      {payload.map((entry) => (
        <p key={entry.dataKey as string} className="mt-0.5 text-sm">
          <span
            className="mr-1.5 inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          {entry.name}: <span className="font-semibold">{entry.value?.toLocaleString()}</span>
        </p>
      ))}
    </div>
  )
}

export default function InventoryCharts({
  summary,
  onWindowChange,
}: {
  summary: InventorySummaryPayload
  onWindowChange: (days: number) => void
}) {
  const [days, setDays] = useState(summary.windowDays)

  function switchWindow(next: number) {
    setDays(next)
    onWindowChange(next)
  }

  const movementTotals = useMemo(() => {
    let inbound = 0
    let outbound = 0
    for (const p of summary.movement) {
      inbound += p.inbound
      outbound += p.outbound
    }
    return { inbound, outbound, net: inbound - outbound }
  }, [summary.movement])

  const productData = useMemo(
    () =>
      summary.topProducts.map((p) => ({
        name: `${p.productName}${p.dose ? ` ${p.dose}` : ''}`,
        onHand: p.onHand,
        reserved: p.reserved,
      })),
    [summary.topProducts]
  )

  const hasMovement = movementTotals.inbound > 0 || movementTotals.outbound > 0

  return (
    <div className="space-y-4">
      {/* Window toggle */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Last {summary.windowDays} days:{' '}
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
            +{movementTotals.inbound.toLocaleString()}
          </span>{' '}
          in ·{' '}
          <span className="font-semibold text-rose-600 dark:text-rose-400">
            −{movementTotals.outbound.toLocaleString()}
          </span>{' '}
          out ·{' '}
          <span className="font-semibold">
            net {movementTotals.net >= 0 ? '+' : ''}
            {movementTotals.net.toLocaleString()}
          </span>
        </p>
        <div className="flex gap-1">
          {[30, 90].map((d) => (
            <button
              key={d}
              onClick={() => switchWindow(d)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                days === d
                  ? 'bg-foreground text-background'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {/* Movement trend */}
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Stock movement — in vs out per day
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hasMovement ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={summary.movement} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: tickColor, fontSize: 11 }}
                    tickFormatter={fmtDayTick}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    tick={{ fill: tickColor, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                  <Bar dataKey="inbound" name="In" fill={INBOUND_COLOR} radius={[3, 3, 0, 0]} maxBarSize={18} />
                  <Bar dataKey="outbound" name="Out" fill={OUTBOUND_COLOR} radius={[3, 3, 0, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
                No stock movement in the last {summary.windowDays} days.
              </div>
            )}
            {/* Reason breakdown */}
            {summary.reasonTotals.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
                {summary.reasonTotals.map((r) => (
                  <span key={r.reason}>
                    {REASON_LABELS[r.reason] ?? r.reason}:{' '}
                    {r.inbound > 0 && (
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        +{r.inbound.toLocaleString()}
                      </span>
                    )}
                    {r.inbound > 0 && r.outbound > 0 && ' / '}
                    {r.outbound > 0 && (
                      <span className="font-semibold text-rose-600 dark:text-rose-400">
                        −{r.outbound.toLocaleString()}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Expiring batches timeline */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Next batches to expire
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summary.expiringBatches.length === 0 ? (
              <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
                No active batches holding stock.
              </div>
            ) : (
              <ul className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
                {summary.expiringBatches.map((b) => {
                  const tone = budTone(b.bud)
                  return (
                    <li
                      key={b.id}
                      className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {b.productName} <span className="text-muted-foreground">· {b.dose}</span>
                        </p>
                        <p className="font-mono text-[11px] text-muted-foreground">
                          {b.batchNumber}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={`text-xs font-semibold ${
                            tone === 'expired'
                              ? 'text-red-600 dark:text-red-400'
                              : tone === 'soon'
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-muted-foreground'
                          }`}
                        >
                          {fmtDate(b.bud)} · {budLabel(b.bud)}
                        </p>
                        <p className="text-xs text-muted-foreground">{b.qtyOnHand} on hand</p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Stock by product */}
        <Card className="lg:col-span-2 xl:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Stock by product — top {summary.topProducts.length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {productData.length === 0 ? (
              <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                No stock on hand yet — receive inventory to populate this chart.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(160, productData.length * 34)}>
                <BarChart
                  data={productData}
                  layout="vertical"
                  margin={{ top: 0, right: 24, left: 8, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(148,163,184,0.15)"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tick={{ fill: tickColor, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={170}
                    tick={{ fill: tickColor, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                  <Bar dataKey="onHand" name="On hand" radius={[0, 3, 3, 0]} maxBarSize={16}>
                    {productData.map((entry, i) => (
                      <Cell key={i} fill={STOCK_COLOR} />
                    ))}
                  </Bar>
                  <Bar dataKey="reserved" name="Reserved" fill={RESERVED_COLOR} radius={[0, 3, 3, 0]} maxBarSize={16} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
