'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface OrderRow {
  id: string
  orderNumber: string
  status: string
  customerEmail: string | null
  customerName: string | null
  itemCount: number
  subtotal: number
  total: number
  createdAt: string
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
  CONFIRMED: 'bg-blue-500/15 text-blue-300 border border-blue-500/30',
  PROCESSING: 'bg-purple-500/15 text-purple-300 border border-purple-500/30',
  SHIPPED: 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30',
  DELIVERED: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
  CANCELLED: 'bg-red-500/15 text-red-300 border border-red-500/30',
  REFUNDED: 'bg-white/10 text-white/70 border border-white/20',
}

export default function StorefrontOrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/clinic/storefront/orders')
      .then(async (res) => {
        if (res.ok) setOrders(await res.json())
      })
      .finally(() => setLoading(false))
  }, [])

  const totalRevenue = orders.reduce((s, o) => s + o.total, 0)

  if (loading) {
    return <div><div className="h-64 bg-white/5 rounded animate-pulse" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/shop/storefront-manage">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Storefront Orders</h1>
          <p className="text-sm text-white/60">Orders placed through your white-label store</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold">{orders.length}</p>
            <p className="text-xs text-white/60">Total Orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold">${totalRevenue.toFixed(2)}</p>
            <p className="text-xs text-white/60">Total Revenue</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold">
              ${orders.length > 0 ? (totalRevenue / orders.length).toFixed(2) : '0.00'}
            </p>
            <p className="text-xs text-white/60">Avg Order Value</p>
          </CardContent>
        </Card>
      </div>

      {/* Orders List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Orders</CardTitle>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <div className="py-12 text-center">
              <ShoppingCart className="h-10 w-10 text-white/30 mx-auto mb-3" />
              <p className="text-white/60">No orders yet. Share your storefront link to start receiving orders.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {orders.map((o) => (
                <div
                  key={o.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-white/10 hover:bg-white/5 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{o.orderNumber}</p>
                    <p className="text-xs text-white/60">
                      {o.customerName || o.customerEmail || 'Guest'} &middot;{' '}
                      {o.itemCount} item{o.itemCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <Badge className={STATUS_COLORS[o.status] ?? 'bg-white/10 text-white/70'}>
                    {o.status}
                  </Badge>
                  <span className="text-sm font-semibold whitespace-nowrap">
                    ${o.total.toFixed(2)}
                  </span>
                  <span className="text-xs text-white/50">
                    {new Date(o.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
