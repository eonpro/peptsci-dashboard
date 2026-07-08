'use client'

import { useState, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { getTotals, groupByProduct, groupByCustomer, getMonthOverMonthSales } from '@/lib/kpis'
import { KPI } from '@/components/KPI'
import { ChartCard } from '@/components/ChartCard'
import { DollarSign, ShoppingCart, Users, TrendingUp, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SalesImportButton } from '@/components/admin/SalesImportButton'
import { StripeBackfillButton } from '@/components/admin/StripeBackfillButton'
import { OrdersBackfillButton } from '@/components/admin/OrdersBackfillButton'
import { toast } from 'sonner'
import GroupedRecentOrdersTable from './GroupedRecentOrdersTable'

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
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold tracking-tight text-white">Dashboard</h2>
        <div className="flex items-center gap-2">
          <SalesImportButton />
          <OrdersBackfillButton />
          <StripeBackfillButton />
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

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPI
          title="Total Sales To Date"
          value={`$${kpis.totalSales.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
          description="All-time revenue"
          icon={<DollarSign />}
        />
        <KPI
          title={`MTD Sales (${currentMonth})`}
          value={`$${kpis.mtdSales.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
          description={
            kpis.mtdSales > 0 ? 'Month-to-date revenue' : `No sales in ${currentMonth} yet`
          }
          icon={<TrendingUp />}
        />
        <KPI
          title="Total Orders"
          value={kpis.totalOrders.toLocaleString()}
          description="All completed orders"
          icon={<ShoppingCart />}
        />
        <KPI
          title="Unique Clients"
          value={kpis.uniqueClients.toLocaleString()}
          description="Total customer base"
          icon={<Users />}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4">
        <ChartCard
          title="Month over Month Sales"
          description="Sales trend over the past months"
          className="w-full"
        >
          <DashboardCharts
            type="line"
            data={monthOverMonthData.map((d) => ({
              month: d.month,
              sales: d.sales,
            }))}
            dataKey="sales"
            xKey="month"
            height={400}
          />
        </ChartCard>
      </div>

      {/* Top Customers Chart */}
      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title="Top 10 Customers" description="By lifetime spend">
          <DashboardCharts
            type="bar"
            data={topCustomers.map((c) => ({
              name: c.name,
              value: c.lifetimeSpend,
            }))}
            dataKey="value"
            xKey="name"
          />
        </ChartCard>

        <ChartCard title="Product Distribution" description="Top 5 products by revenue">
          <DashboardCharts
            type="pie"
            data={productMetrics.slice(0, 5).map((p) => ({
              name: p.product,
              value: p.totalRevenue,
            }))}
          />
        </ChartCard>
      </div>

      {/* Recent Orders Table */}
      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-white">Recent Orders</h3>
        <GroupedRecentOrdersTable data={recentOrders} />
      </div>
    </div>
  )
}
