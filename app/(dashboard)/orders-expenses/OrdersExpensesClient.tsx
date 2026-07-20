'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Package, DollarSign, TrendingUp, Truck, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import type { DistributorOrder } from '@/lib/orders'
import { DistributorOrderImportButton } from '@/components/admin/DistributorOrderImportButton'
import { apiError } from '@/lib/api-error'

/** date-fns `format` needs a Date; the refresh path returns ISO strings. */
function toDate(value: Date | string | null): Date | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export default function OrdersExpensesClient({
  initialOrders,
}: {
  initialOrders: DistributorOrder[]
}) {
  // Seeded from the server render — no first-paint skeleton / client round trip.
  const [orders, setOrders] = useState<DistributorOrder[]>(initialOrders)
  const [filter, setFilter] = useState<'all' | 'pending' | 'shipped' | 'delivered'>('all')
  const [refreshing, setRefreshing] = useState(false)

  // `force` bypasses the browser cache for an explicit manual refresh.
  /** Returns null on success, or the (server-provided) error message. */
  async function fetchOrders(force = false): Promise<string | null> {
    try {
      const response = await fetch(force ? `/api/orders?t=${Date.now()}` : '/api/orders', {
        cache: force ? 'no-store' : 'default',
      })
      if (!response.ok) throw await apiError(response, 'Failed to fetch orders')
      setOrders(await response.json())
      return null
    } catch (error) {
      console.error('Error fetching orders:', error)
      return error instanceof Error ? error.message : 'Failed to fetch orders'
    } finally {
      setRefreshing(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    const err = await fetchOrders(true)
    if (!err) toast.success('Orders refreshed')
    else toast.error(err)
  }

  // Calculate totals
  const totalSpent = orders.reduce((sum, order) => sum + order.total, 0)
  const totalProducts = orders.reduce(
    (sum, order) => sum + order.products.reduce((pSum, product) => pSum + product.quantity, 0),
    0
  )
  const totalShipping = orders.reduce((sum, order) => sum + order.shipping, 0)
  const totalPaypalFees = orders.reduce((sum, order) => sum + order.paypalFee, 0)
  const averageOrderValue = orders.length > 0 ? totalSpent / orders.length : 0

  // Filter orders
  const filteredOrders = orders.filter((order) => {
    if (filter === 'all') return true
    return order.status === filter
  })

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'delivered':
        return <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-400/30">Delivered</Badge>
      case 'shipped':
        return <Badge className="bg-blue-500/15 text-blue-300 border border-blue-400/30">Shipped</Badge>
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Orders & Expenses</h1>
          <p className="text-muted-foreground">Track distributor orders and shipping expenses</p>
        </div>
        <div className="flex items-center gap-2">
          <DistributorOrderImportButton />
          <Button onClick={handleRefresh} variant="outline" disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalSpent.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">All-time expenses</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalProducts.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Units ordered</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Shipping Costs</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalShipping.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Total shipping fees</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">PayPal Fees</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalPaypalFees.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Total transaction fees</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Order Value</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${averageOrderValue.toFixed(0)}</div>
            <p className="text-xs text-muted-foreground">Per order average</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <Select
          value={filter}
          onValueChange={(value) => {
            if (
              value === 'all' ||
              value === 'pending' ||
              value === 'shipped' ||
              value === 'delivered'
            ) {
              setFilter(value)
            }
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Orders</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="shipped">Shipped</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>Distributor Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Products</TableHead>
                <TableHead>Subtotal</TableHead>
                <TableHead>Shipping</TableHead>
                <TableHead>PayPal Fee</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                    {orders.length === 0
                      ? 'No distributor orders yet. Import orders to get started.'
                      : 'No orders match this filter.'}
                  </TableCell>
                </TableRow>
              )}
              {filteredOrders.map((order) => {
                const orderDate = toDate(order.orderDate)
                return (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.id}</TableCell>
                    <TableCell>{orderDate ? format(orderDate, 'MM/dd/yyyy') : '-'}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {order.products.map((product, idx) => (
                          <div key={idx} className="text-xs">
                            {product.quantity}x {product.name} {product.dose}
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>${order.subtotal.toFixed(2)}</TableCell>
                    <TableCell>${order.shipping.toFixed(2)}</TableCell>
                    <TableCell>${order.paypalFee.toFixed(2)}</TableCell>
                    <TableCell className="font-bold">${order.total.toFixed(2)}</TableCell>
                    <TableCell>{getStatusBadge(order.status)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Monthly Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Expense Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {(() => {
              // Group orders by month
              type MonthlyStats = {
                orders: number
                total: number
                products: number
                shipping: number
                paypalFees: number
              }

              const monthlyData = orders.reduce<Record<string, MonthlyStats>>((acc, order) => {
                const orderDate = toDate(order.orderDate)
                if (!orderDate) return acc
                const monthKey = format(orderDate, 'MMMM yyyy')
                if (!acc[monthKey]) {
                  acc[monthKey] = {
                    orders: 0,
                    total: 0,
                    products: 0,
                    shipping: 0,
                    paypalFees: 0,
                  }
                }
                acc[monthKey].orders++
                acc[monthKey].total += order.total
                acc[monthKey].products += order.subtotal
                acc[monthKey].shipping += order.shipping
                acc[monthKey].paypalFees += order.paypalFee
                return acc
              }, {})

              return Object.entries(monthlyData)
                .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
                .slice(0, 6)
                .map(([month, data]) => (
                  <div
                    key={month}
                    className="flex justify-between items-center p-4 bg-muted/40 rounded-lg"
                  >
                    <div>
                      <div className="font-medium">{month}</div>
                      <div className="text-sm text-muted-foreground">
                        {data.orders} order{data.orders !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold">${data.total.toFixed(2)}</div>
                      <div className="text-sm text-muted-foreground">
                        Product: ${data.products.toFixed(0)} | Shipping: ${data.shipping.toFixed(0)}{' '}
                        | Fees: ${data.paypalFees.toFixed(0)}
                      </div>
                    </div>
                  </div>
                ))
            })()}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
