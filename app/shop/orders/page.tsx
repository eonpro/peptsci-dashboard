'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Package,
  Search,
  ChevronRight,
  Clock,
  CheckCircle2,
  Truck,
  XCircle,
  ShoppingBag,
  Loader2,
} from 'lucide-react'

type OrderItem = {
  name: string
  dose: string | null
  sku: string | null
  quantity: number
  unitPrice: number
  total: number
}

type Order = {
  id: string
  orderNumber: number
  status: string
  shippingStatus: string | null
  total: number
  carrier: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  shippedAt: string | null
  createdAt: string
  items: OrderItem[]
}

type StatusBucket = 'processing' | 'shipped' | 'delivered' | 'cancelled'

const statusConfig: Record<StatusBucket, { label: string; color: string; icon: typeof Clock }> = {
  processing: { label: 'Processing', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  shipped: { label: 'Shipped', color: 'bg-blue-100 text-blue-700', icon: Truck },
  delivered: { label: 'Delivered', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700', icon: XCircle },
}

/** Collapse the granular Order/shipping status into the 4 client-facing buckets. */
function bucketFor(order: Order): StatusBucket {
  if (order.status === 'CANCELLED' || order.status === 'REJECTED') return 'cancelled'
  if (order.status === 'COMPLETED' || order.shippingStatus === 'DELIVERED') return 'delivered'
  if (order.status === 'SHIPPED' || order.trackingNumber) return 'shipped'
  return 'processing'
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusBucket | 'all'>('all')

  useEffect(() => {
    let active = true
    fetch('/api/shop/orders')
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.message || data.error || 'Failed to load orders')
        return data
      })
      .then((data) => {
        if (active) setOrders(data.orders ?? [])
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : 'Failed to load orders'))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const filteredOrders = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return orders.filter((order) => {
      const matchesSearch =
        `#${order.orderNumber}`.toLowerCase().includes(q) ||
        order.items.some((item) => item.name.toLowerCase().includes(q)) ||
        (order.trackingNumber?.toLowerCase().includes(q) ?? false)
      const matchesStatus = statusFilter === 'all' || bucketFor(order) === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [orders, searchQuery, statusFilter])

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price)
  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

  const counts = useMemo(
    () => ({
      total: orders.length,
      processing: orders.filter((o) => bucketFor(o) === 'processing').length,
      shipped: orders.filter((o) => bucketFor(o) === 'shipped').length,
      delivered: orders.filter((o) => bucketFor(o) === 'delivered').length,
    }),
    [orders]
  )

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">My Orders</h1>
        <p className="text-gray-500 mt-1">Track and manage your orders</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search orders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusBucket | 'all')}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Orders</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="shipped">Shipped</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-16 text-gray-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading your orders…
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="py-12 text-center text-red-600">{error}</CardContent>
        </Card>
      ) : filteredOrders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-gray-100 p-6 mb-4">
              <ShoppingBag className="h-12 w-12 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">No orders found</h3>
            <p className="text-gray-500 mt-1 text-center">
              {searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your filters'
                : "You haven't placed any orders yet"}
            </p>
            {!searchQuery && statusFilter === 'all' && (
              <Button className="mt-4" asChild>
                <Link href="/shop">Start Shopping</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            const status = statusConfig[bucketFor(order)]
            const StatusIcon = status.icon
            return (
              <Card key={order.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <CardContent className="p-0">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-gray-50 border-b">
                    <div className="flex items-center gap-4">
                      <div className="hidden sm:flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100">
                        <Package className="h-6 w-6 text-indigo-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">Order #{order.orderNumber}</p>
                        <p className="text-sm text-gray-500">Placed on {formatDate(order.createdAt)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={status.color}>
                        <StatusIcon className="mr-1 h-3 w-3" />
                        {status.label}
                      </Badge>
                      <span className="font-semibold text-gray-900">{formatPrice(order.total)}</span>
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="space-y-3">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-4">
                          <div className="h-14 w-14 rounded-lg bg-linear-to-br from-indigo-100 to-purple-100 flex items-center justify-center shrink-0">
                            <span className="text-lg font-bold text-indigo-300">{item.name.charAt(0)}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900">{item.name}</p>
                            <p className="text-sm text-gray-500">
                              {item.dose ? `${item.dose} × ` : ''}
                              {item.quantity}
                            </p>
                          </div>
                          <p className="text-sm font-medium text-gray-900">{formatPrice(item.total)}</p>
                        </div>
                      ))}
                    </div>

                    {order.trackingNumber && (
                      <div className="mt-4 flex items-center gap-2 text-sm">
                        <Truck className="h-4 w-4 text-gray-400" />
                        <span className="text-gray-500">{order.carrier || 'Tracking'}:</span>
                        <code className="bg-gray-100 px-2 py-1 rounded text-xs">{order.trackingNumber}</code>
                      </div>
                    )}

                    <div className="mt-4 flex justify-end">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/shop/orders/${order.id}`}>
                          View Details
                          <ChevronRight className="ml-1 h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {!loading && !error && orders.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center p-3 rounded-xl bg-gray-50">
                <p className="text-2xl font-bold text-gray-900">{counts.total}</p>
                <p className="text-xs text-gray-500">Total Orders</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-yellow-50">
                <p className="text-2xl font-bold text-yellow-700">{counts.processing}</p>
                <p className="text-xs text-yellow-600">Processing</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-blue-50">
                <p className="text-2xl font-bold text-blue-700">{counts.shipped}</p>
                <p className="text-xs text-blue-600">Shipped</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-green-50">
                <p className="text-2xl font-bold text-green-700">{counts.delivered}</p>
                <p className="text-xs text-green-600">Delivered</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
