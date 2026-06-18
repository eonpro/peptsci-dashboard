'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Receipt,
  Package,
  Layers,
  BarChart3,
  Calendar,
  Wallet,
} from 'lucide-react'
import { format, subMonths } from 'date-fns'
import {
  calculateMonthlyProfitLoss,
  calculateYearToDateProfitLoss,
  calculateBalanceSheet,
  type MonthlyProfitLoss,
  type YearToDateProfitLoss,
  type BalanceSheetSummary,
} from '@/lib/finance'
import type { Sale } from '@/lib/sales'
import type { Inventory } from '@/lib/inventory'

type DistributorOrder = Parameters<typeof calculateBalanceSheet>[1][number]

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

const numberFormatter = new Intl.NumberFormat('en-US')

const formatCurrency = (value: number) => currencyFormatter.format(value)
const formatNumber = (value: number) => numberFormatter.format(value)
const formatPercent = (value: number) => `${Number.isFinite(value) ? value.toFixed(1) : '0.0'}%`

const generateMockSales = (): Sale[] => {
  const products = [
    { name: 'Semaglutide 10mg', avgPrice: 400, avgCost: 90 },
    { name: 'Tirzepatide 60mg', avgPrice: 850, avgCost: 230 },
    { name: 'BPC-157 10mg', avgPrice: 300, avgCost: 82 },
    { name: 'GHK-Cu 100mg', avgPrice: 450, avgCost: 125 },
    { name: 'Retatrutide 20mg', avgPrice: 650, avgCost: 220 },
  ]

  const sales: Sale[] = []
  const now = new Date()

  for (let monthOffset = 0; monthOffset < 6; monthOffset++) {
    const month = subMonths(now, monthOffset)
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    const numSales = Math.floor(Math.random() * 20) + 40

    for (let i = 0; i < numSales; i++) {
      const product = products[Math.floor(Math.random() * products.length)]
      const day = Math.floor(Math.random() * daysInMonth) + 1
      const vials = Math.floor(Math.random() * 3) + 1
      const paidAmount = product.avgPrice * vials
      const cogs = product.avgCost * vials
      const profit = paidAmount - cogs

      sales.push({
        Date: new Date(month.getFullYear(), month.getMonth(), day),
        OrderID: `P-${format(month, 'MM')}${String(day).padStart(2, '0')}-${String(i + 1).padStart(
          3,
          '0'
        )}`,
        CustomerName: `Customer ${i + 1}`,
        CustomerEmail: '',
        CustomerPhone: '',
        Address: '',
        City: '',
        State: '',
        Zip: '',
        TrackingNumber: '',
        InvoicePaid: true,
        PaidAmount: paidAmount,
        Vials: vials,
        AmountPerVial: product.avgPrice,
        Product: product.name,
        Notes: 'Fulfilled',
        COGS: cogs,
        Profit: profit,
        ProfitMargin: paidAmount > 0 ? (profit / paidAmount) * 100 : 0,
        Markup: cogs > 0 ? (profit / cogs) * 100 : 0,
      })
    }
  }

  return sales
}

export interface ProfitLossClientProps {
  initialSales: Sale[]
  initialInventory: Inventory[]
  initialOrders: DistributorOrder[]
}

export default function ProfitLossClient({
  initialSales,
  initialInventory,
  initialOrders,
}: ProfitLossClientProps) {
  // Seed from server-rendered data (see page.tsx). Fall back to mock sales only
  // when the source returned nothing, preserving the previous demo behavior.
  const [sales] = useState<Sale[]>(() =>
    initialSales.length > 0 ? initialSales : generateMockSales()
  )
  const [inventory] = useState<Inventory[]>(initialInventory)
  const [orders] = useState<DistributorOrder[]>(initialOrders)
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>('')

  const monthlySummaries = useMemo(() => calculateMonthlyProfitLoss(sales), [sales])

  useEffect(() => {
    if (!selectedMonthKey && monthlySummaries.length > 0) {
      const latest = monthlySummaries[monthlySummaries.length - 1]
      setSelectedMonthKey(latest.monthKey)
    }
  }, [monthlySummaries, selectedMonthKey])

  const monthOptions = useMemo(
    () =>
      [...monthlySummaries].sort((a, b) => {
        if (a.year === b.year) return b.month - a.month
        return b.year - a.year
      }),
    [monthlySummaries]
  )

  const selectedMonth: MonthlyProfitLoss | null = useMemo(() => {
    if (!selectedMonthKey) return null
    return monthOptions.find((month) => month.monthKey === selectedMonthKey) ?? null
  }, [monthOptions, selectedMonthKey])

  const ytdSummary: YearToDateProfitLoss | null = useMemo(() => {
    if (!selectedMonth) return null
    return calculateYearToDateProfitLoss(sales, selectedMonth.year, selectedMonth.month)
  }, [sales, selectedMonth])

  const balanceSheet: BalanceSheetSummary = useMemo(
    () =>
      calculateBalanceSheet(inventory, orders, {
        year: selectedMonth?.year ?? new Date().getFullYear(),
        asOf: new Date(),
      }),
    [inventory, orders, selectedMonth]
  )

  const monthlyTrend = useMemo(() => monthOptions.slice(0, 6), [monthOptions])
  const productBreakdown = selectedMonth?.productBreakdown ?? []

  const monthlyRevenue = selectedMonth?.revenue ?? 0
  const monthlyCOGS = selectedMonth?.cogs ?? 0
  const monthlyGrossProfit = selectedMonth?.grossProfit ?? 0
  const monthlyGrossMargin = selectedMonth?.grossMargin ?? 0
  const monthlyNetProfit = selectedMonth?.netProfit ?? 0
  const monthlyNetMargin = selectedMonth?.netMargin ?? 0
  const monthlyOrders = selectedMonth?.orderCount ?? 0
  const monthlyAvgOrder = monthlyOrders > 0 ? monthlyRevenue / monthlyOrders : 0

  const ytdRevenue = ytdSummary?.revenue ?? 0
  const ytdGrossProfit = ytdSummary?.grossProfit ?? 0
  const ytdGrossMargin = ytdSummary?.grossMargin ?? 0
  const ytdNetProfit = ytdSummary?.netProfit ?? 0
  const ytdNetMargin = ytdSummary?.netMargin ?? 0
  const ytdOrders = ytdSummary?.orderCount ?? 0
  const ytdAvgOrder = ytdOrders > 0 ? ytdRevenue / ytdOrders : 0

  const inventoryValue = balanceSheet.inventory.totalInventoryValue
  const inventoryUnits = balanceSheet.inventory.totalOnHandUnits
  const spendAllTime = balanceSheet.spendAllTime.totalSpend
  const spendYTD = balanceSheet.spendYTD?.totalSpend ?? 0
  const spendOrdersYTD = balanceSheet.spendYTD?.orders ?? 0
  const outstandingOrdersValue = balanceSheet.outstandingOrdersValue
  const balanceSheetAsOf = format(balanceSheet.asOf, 'MMMM d, yyyy')

  if (monthlySummaries.length === 0 || !selectedMonth) {
    return (
      <div className="container mx-auto space-y-6 p-6">
        <div className="rounded-lg border bg-white p-12 text-center shadow-sm">
          <h1 className="text-3xl font-bold mb-3">Profit & Loss Statement</h1>
          <p className="text-muted-foreground">
            We haven&apos;t received any paid orders yet. Once invoices are marked paid, monthly and
            year-to-date performance will appear here automatically.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Profit &amp; Loss Statement</h1>
          <p className="text-muted-foreground">
            Cash-based view of revenue, fulfillment costs, and inventory position.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase text-muted-foreground">
            Reporting Month
          </span>
          <Select
            value={selectedMonthKey || undefined}
            onValueChange={(value) => setSelectedMonthKey(value)}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Choose month" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((month) => (
                <SelectItem key={month.monthKey} value={month.monthKey}>
                  {month.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(monthlyRevenue)}</div>
            <p className="text-xs text-muted-foreground">
              {monthlyOrders} paid order{monthlyOrders === 1 ? '' : 's'} · Avg order{' '}
              {formatCurrency(monthlyAvgOrder || 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">COGS (Fulfilled)</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(-monthlyCOGS)}</div>
            <p className="text-xs text-muted-foreground">
              Product cost tied to fulfilled, paid orders
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gross Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(monthlyGrossProfit)}</div>
            <p className="text-xs text-muted-foreground">
              Gross margin {formatPercent(monthlyGrossMargin)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
            {monthlyNetProfit >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600" />
            )}
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                monthlyNetProfit >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {formatCurrency(monthlyNetProfit)}
            </div>
            <p className="text-xs text-muted-foreground">
              Net margin {formatPercent(monthlyNetMargin)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">YTD Revenue</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(ytdRevenue)}</div>
            <p className="text-xs text-muted-foreground">Through {selectedMonth.label}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">YTD Gross Profit</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(ytdGrossProfit)}</div>
            <p className="text-xs text-muted-foreground">
              Gross margin {formatPercent(ytdGrossMargin)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paid Orders YTD</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(ytdOrders)}</div>
            <p className="text-xs text-muted-foreground">
              Avg order {formatCurrency(ytdAvgOrder || 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">YTD Net Profit</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(ytdNetProfit)}</div>
            <p className="text-xs text-muted-foreground">
              Net margin {formatPercent(ytdNetMargin)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Income Statement — {selectedMonth.label}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Paid Orders</span>
              <span>{monthlyOrders}</span>
            </div>

            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">Revenue</span>
                <span className="font-semibold text-lg">{formatCurrency(monthlyRevenue)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Cost of Goods Sold</span>
                <span className="text-red-600">{formatCurrency(-monthlyCOGS)}</span>
              </div>
              <div className="flex items-center justify-between border-t pt-3">
                <div>
                  <div className="font-bold">Gross Profit</div>
                  <div className="text-xs text-muted-foreground">
                    Margin {formatPercent(monthlyGrossMargin)}
                  </div>
                </div>
                <span className="font-semibold text-lg">{formatCurrency(monthlyGrossProfit)}</span>
              </div>
            </div>

            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Operating expenses are not yet synced from your ERP. Add them to include a complete
              P&amp;L view.
            </div>

            <div className="rounded-lg bg-brand-primary/10 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-lg">Net Profit</div>
                  <div className="text-xs text-muted-foreground">
                    Margin {formatPercent(monthlyNetMargin)}
                  </div>
                </div>
                <span
                  className={`text-xl font-bold ${
                    monthlyNetProfit >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {formatCurrency(monthlyNetProfit)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Product Contribution — {selectedMonth.label}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2">Product</th>
                  <th className="py-2 text-right">Revenue</th>
                  <th className="py-2 text-right">COGS</th>
                  <th className="py-2 text-right">Profit</th>
                  <th className="py-2 text-right">Margin</th>
                  <th className="py-2 text-right">Orders</th>
                  <th className="py-2 text-right">Vials</th>
                </tr>
              </thead>
              <tbody>
                {productBreakdown.length === 0 && (
                  <tr>
                    <td className="py-4 text-center text-muted-foreground" colSpan={7}>
                      No paid orders recorded for this month.
                    </td>
                  </tr>
                )}
                {productBreakdown.map((product) => (
                  <tr key={product.product} className="border-b last:border-0">
                    <td className="py-2 font-medium">{product.product}</td>
                    <td className="py-2 text-right">{formatCurrency(product.revenue)}</td>
                    <td className="py-2 text-right text-red-600">
                      {formatCurrency(-product.cogs)}
                    </td>
                    <td className="py-2 text-right text-green-600">
                      {formatCurrency(product.profit)}
                    </td>
                    <td className="py-2 text-right">
                      {formatPercent(
                        product.revenue > 0 ? (product.profit / product.revenue) * 100 : 0
                      )}
                    </td>
                    <td className="py-2 text-right">{formatNumber(product.orders)}</td>
                    <td className="py-2 text-right">{formatNumber(product.vials)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Monthly Trend (Last 6 Months)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2">Month</th>
                  <th className="py-2 text-right">Revenue</th>
                  <th className="py-2 text-right">COGS</th>
                  <th className="py-2 text-right">Gross Profit</th>
                  <th className="py-2 text-right">Margin</th>
                  <th className="py-2 text-right">Paid Orders</th>
                </tr>
              </thead>
              <tbody>
                {monthlyTrend.map((month) => (
                  <tr key={month.monthKey} className="border-b last:border-0">
                    <td className="py-2">{month.label}</td>
                    <td className="py-2 text-right">{formatCurrency(month.revenue)}</td>
                    <td className="py-2 text-right text-red-600">{formatCurrency(-month.cogs)}</td>
                    <td className="py-2 text-right">{formatCurrency(month.grossProfit)}</td>
                    <td className="py-2 text-right">{formatPercent(month.grossMargin)}</td>
                    <td className="py-2 text-right">{formatNumber(month.orderCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Balance Sheet Snapshot</CardTitle>
          <p className="text-sm text-muted-foreground">As of {balanceSheetAsOf}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Inventory Value</span>
                <Layers className="h-4 w-4" />
              </div>
              <div className="mt-2 text-2xl font-semibold">{formatCurrency(inventoryValue)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {formatNumber(inventoryUnits)} units on hand
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Inventory Spend (YTD)</span>
                <Wallet className="h-4 w-4" />
              </div>
              <div className="mt-2 text-2xl font-semibold">{formatCurrency(spendYTD)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {formatNumber(spendOrdersYTD)} distributor order
                {spendOrdersYTD === 1 ? '' : 's'}
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Inventory Spend (All Time)</span>
                <DollarSign className="h-4 w-4" />
              </div>
              <div className="mt-2 text-2xl font-semibold">{formatCurrency(spendAllTime)}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Outstanding Distributor Orders</span>
                <Receipt className="h-4 w-4" />
              </div>
              <div className="mt-2 text-2xl font-semibold">
                {formatCurrency(outstandingOrdersValue)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Includes orders not yet marked delivered
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2">Product</th>
                  <th className="py-2">Dose</th>
                  <th className="py-2 text-right">On Hand</th>
                  <th className="py-2 text-right">Unit Cost</th>
                  <th className="py-2 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {balanceSheet.inventory.items.length === 0 && (
                  <tr>
                    <td className="py-4 text-center text-muted-foreground" colSpan={5}>
                      No inventory data available.
                    </td>
                  </tr>
                )}
                {balanceSheet.inventory.items.slice(0, 10).map((item, index) => (
                  <tr
                    key={`${item.sku || 'item'}-${item.dose}-${index}`}
                    className="border-b last:border-0"
                  >
                    <td className="py-2 font-medium">{item.product}</td>
                    <td className="py-2">{item.dose}</td>
                    <td className="py-2 text-right">{formatNumber(item.onHand)}</td>
                    <td className="py-2 text-right">{formatCurrency(item.unitCost)}</td>
                    <td className="py-2 text-right">{formatCurrency(item.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
