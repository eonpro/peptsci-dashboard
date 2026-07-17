'use client'

import { useMemo, useState } from 'react'
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
} from 'lucide-react'
import { BuyAgainButton } from '@/components/shop/BuyAgainButton'
import type { ShopOrder } from '@/lib/shop-orders'

type StatusBucket = 'processing' | 'shipped' | 'delivered' | 'cancelled'

const statusConfig: Record<StatusBucket, { label: string; color: string; icon: typeof Clock }> = {
  processing: { label: 'Processing', color: 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/30', icon: Clock },
  shipped: { label: 'Shipped', color: 'bg-blue-500/15 text-blue-300 border border-blue-500/30', icon: Truck },
  delivered: { label: 'Delivered', color: 'bg-green-500/15 text-green-300 border border-green-500/30', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', color: 'bg-red-500/15 text-red-300 border border-red-500/30', icon: XCircle },
}

/** Collapse the granular Order/shipping status into the 4 client-facing buckets. */
function bucketFor(order: ShopOrder): StatusBucket {
  if (order.status === 'CANCELLED' || order.status === 'REJECTED') return 'cancelled'
  if (order.status === 'COMPLETED' || order.shippingStatus === 'DELIVERED') return 'delivered'
  if (order.status === 'SHIPPED' || order.trackingNumber) return 'shipped'
  return 'processing'
}

export function OrdersClient({ orders }: { orders: ShopOrder[] }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusBucket | 'all'>('all')

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
        <h1 className="text-3xl font-bold text-white">My Orders</h1>
        <p className="text-white/60 mt-1">Track and manage your orders</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
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

      {filteredOrders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-white/10 p-6 mb-4">
              <ShoppingBag className="h-12 w-12 text-white/40" />
            </div>
            <h3 className="text-lg font-medium text-white">No orders found</h3>
            <p className="text-white/60 mt-1 text-center">
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
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-white/5 border-b border-white/10">
                    <div className="flex items-center gap-4">
                      <div className="hidden sm:flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/20">
                        <Package className="h-6 w-6 text-indigo-300" />
                      </div>
                      <div>
                        <p className="font-semibold text-white">Order #{order.orderNumber}</p>
                        <p className="text-sm text-white/60">Placed on {formatDate(order.createdAt)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={status.color}>
                        <StatusIcon className="mr-1 h-3 w-3" />
                        {status.label}
                      </Badge>
                      <span className="font-semibold text-white">{formatPrice(order.total)}</span>
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="space-y-3">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-4">
                          <div className="h-14 w-14 rounded-lg bg-linear-to-br from-indigo-500/25 to-purple-500/25 flex items-center justify-center shrink-0">
                            <span className="text-lg font-bold text-indigo-200">{item.name.charAt(0)}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-white">{item.name}</p>
                            <p className="text-sm text-white/60">
                              {item.dose ? `${item.dose} × ` : ''}
                              {item.quantity}
                            </p>
                          </div>
                          <p className="text-sm font-medium text-white">{formatPrice(item.total)}</p>
                        </div>
                      ))}
                    </div>

                    {order.trackingNumber && (
                      <div className="mt-4 flex items-center gap-2 text-sm">
                        <Truck className="h-4 w-4 text-white/40" />
                        <span className="text-white/60">{order.carrier || 'Tracking'}:</span>
                        <code className="bg-white/10 text-white px-2 py-1 rounded text-xs">{order.trackingNumber}</code>
                      </div>
                    )}

                    <div className="mt-4 flex justify-end gap-2">
                      <BuyAgainButton orderId={order.id} />
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

      {orders.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center p-3 rounded-xl bg-white/5 border border-white/10">
                <p className="text-2xl font-bold text-white">{counts.total}</p>
                <p className="text-xs text-white/60">Total Orders</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                <p className="text-2xl font-bold text-yellow-300">{counts.processing}</p>
                <p className="text-xs text-yellow-300/80">Processing</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <p className="text-2xl font-bold text-blue-300">{counts.shipped}</p>
                <p className="text-xs text-blue-300/80">Shipped</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                <p className="text-2xl font-bold text-green-300">{counts.delivered}</p>
                <p className="text-xs text-green-300/80">Delivered</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
