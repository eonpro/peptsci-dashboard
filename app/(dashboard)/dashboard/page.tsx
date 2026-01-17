'use client'

import { useState, useEffect, useMemo } from 'react'
import { getTotals, groupByProduct, groupByCustomer, getMonthOverMonthSales } from '@/lib/kpis'
import { KPI } from '@/components/KPI'
import { ChartCard } from '@/components/ChartCard'
import { DollarSign, ShoppingCart, Users, TrendingUp, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import DashboardCharts from './DashboardCharts'
import GroupedRecentOrdersTable from './GroupedRecentOrdersTable'
import type { Sale } from '@/lib/sheets'
import { format } from 'date-fns'

type ApiSale = Omit<Sale, 'Date'> & { Date: string | null }

export default function DashboardPage() {
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Fetch sales data function
  async function loadData() {
    try {
      // Force cache bypass with timestamp
      const response = await fetch(`/api/sales?t=${Date.now()}`, {
        cache: 'no-store'
      })
      if (!response.ok) {
        throw new Error('Failed to fetch sales')
      }
      const data: ApiSale[] = await response.json()
      // Convert Date strings back to Date objects
      const salesWithDates: Sale[] = data.map((sale) => ({
        ...sale,
        Date: sale.Date ? new Date(sale.Date) : null,
      }))
      setSales(salesWithDates)
    } catch (error) {
      console.error('Error fetching sales:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // Fetch data on mount
  useEffect(() => {
    loadData()
  }, [])

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadData()
    }, 60000) // Refresh every minute
    
    return () => clearInterval(interval)
  }, [])

  // Manual refresh function
  const handleRefresh = async () => {
    setRefreshing(true)
    await loadData()
  }

  // Get current month name dynamically - must be before any conditional returns
  const currentMonth = useMemo(() => format(new Date(), 'MMMM'), [])

  if (loading) {
    return (
      <div className="container mx-auto space-y-6 p-6">
        <div className="animate-pulse">
          <div className="h-8 w-48 bg-gray-200 rounded mb-4"></div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const kpis = getTotals(sales)
  const productMetrics = groupByProduct(sales)
  const customerMetrics = groupByCustomer(sales)
  const monthOverMonthData = getMonthOverMonthSales(sales)
  
  // Get recent orders (last 20)
  const recentOrders = sales
    .filter(s => s.Date)
    .sort((a, b) => {
      if (!a.Date || !b.Date) return 0
      return b.Date.getTime() - a.Date.getTime()
    })
    .slice(0, 20)
  
  // Top 10 customers
  const topCustomers = customerMetrics.slice(0, 10)

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <Button
          onClick={handleRefresh}
          variant="outline"
          size="sm"
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>
      
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPI
          title="Total Sales To Date"
          value={`$${kpis.totalSales.toLocaleString('en-US', { 
            minimumFractionDigits: 2,
            maximumFractionDigits: 2 
          })}`}
          description="All-time revenue"
          icon={<DollarSign />}
        />
        <KPI
          title={`MTD Sales (${currentMonth})`}
          value={`$${kpis.mtdSales.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })}`}
          description={kpis.mtdSales > 0 ? "Month-to-date revenue" : `No sales in ${currentMonth} yet`}
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
            data={monthOverMonthData.map(d => ({
              month: d.month,
              sales: d.sales
            }))}
            dataKey="sales"
            xKey="month"
            height={400}
          />
        </ChartCard>
      </div>

      {/* Top Customers Chart */}
      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard 
          title="Top 10 Customers"
          description="By lifetime spend"
        >
          <DashboardCharts
            type="bar"
            data={topCustomers.map(c => ({
              name: c.name,
              value: c.lifetimeSpend
            }))}
            dataKey="value"
            xKey="name"
          />
        </ChartCard>

        <ChartCard 
          title="Product Distribution"
          description="Top 5 products by revenue"
        >
          <DashboardCharts
            type="pie"
            data={productMetrics.slice(0, 5).map(p => ({
              name: p.product,
              value: p.totalRevenue
            }))}
          />
        </ChartCard>
      </div>

      {/* Recent Orders Table */}
      <div className="space-y-4">
        <h3 className="text-xl font-semibold">Recent Orders</h3>
        <GroupedRecentOrdersTable data={recentOrders} />
      </div>
    </div>
  )
}