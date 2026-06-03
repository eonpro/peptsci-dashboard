'use client'

import { useState, useEffect } from 'react'
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

interface DistributorOrder {
  id: string
  orderDate: Date | null
  vendor: string
  products: {
    name: string
    dose: string
    quantity: number
    unitCost: number
    total: number
  }[]
  subtotal: number
  shipping: number
  paypalFee: number
  total: number
  status: 'pending' | 'shipped' | 'delivered'
  trackingNumber?: string
}

export default function OrdersExpensesPage() {
  const [orders, setOrders] = useState<DistributorOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'shipped' | 'delivered'>('all')
  const [refreshing, setRefreshing] = useState(false)

  // Fetch orders function
  async function fetchOrders() {
    try {
      // Force cache bypass with timestamp
      const response = await fetch(`/api/orders?t=${Date.now()}`, {
        cache: 'no-store',
      })
      if (!response.ok) {
        throw new Error('Failed to fetch orders')
      }
      const data = await response.json()
      setOrders(data)
    } catch (error) {
      console.error('Error fetching orders:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // Fetch orders on mount
  useEffect(() => {
    fetchOrders()
  }, [])

  // Manual refresh function
  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchOrders()
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
        return <Badge className="bg-green-100 text-green-800">Delivered</Badge>
      case 'shipped':
        return <Badge className="bg-blue-100 text-blue-800">Shipped</Badge>
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto space-y-6 p-6">
        <div className="animate-pulse">
          <div className="h-8 w-48 bg-gray-200 rounded mb-4"></div>
          <div className="h-4 w-64 bg-gray-200 rounded mb-6"></div>
          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Orders & Expenses</h1>
          <p className="text-muted-foreground">Track distributor orders and shipping expenses</p>
        </div>
        <Button onClick={handleRefresh} variant="outline" disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
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
              {filteredOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">{order.id}</TableCell>
                  <TableCell>
                    {order.orderDate ? format(order.orderDate, 'MM/dd/yyyy') : '-'}
                  </TableCell>
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
              ))}
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
                if (!order.orderDate) return acc
                const monthKey = format(order.orderDate, 'MMMM yyyy')
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
                    className="flex justify-between items-center p-4 bg-gray-50 rounded-lg"
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
