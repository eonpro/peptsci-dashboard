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
  PENDING: 'bg-amber-100 text-amber-800',
  CONFIRMED: 'bg-blue-100 text-blue-800',
  PROCESSING: 'bg-purple-100 text-purple-800',
  SHIPPED: 'bg-indigo-100 text-indigo-800',
  DELIVERED: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-red-100 text-red-800',
  REFUNDED: 'bg-gray-100 text-gray-800',
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
    return <div className="max-w-4xl mx-auto p-6"><div className="h-64 bg-gray-100 rounded animate-pulse" /></div>
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/shop/storefront-manage">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Storefront Orders</h1>
          <p className="text-sm text-gray-500">Orders placed through your white-label store</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold">{orders.length}</p>
            <p className="text-xs text-gray-500">Total Orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold">${totalRevenue.toFixed(2)}</p>
            <p className="text-xs text-gray-500">Total Revenue</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold">
              ${orders.length > 0 ? (totalRevenue / orders.length).toFixed(2) : '0.00'}
            </p>
            <p className="text-xs text-gray-500">Avg Order Value</p>
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
              <ShoppingCart className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No orders yet. Share your storefront link to start receiving orders.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {orders.map((o) => (
                <div
                  key={o.id}
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{o.orderNumber}</p>
                    <p className="text-xs text-gray-500">
                      {o.customerName || o.customerEmail || 'Guest'} &middot;{' '}
                      {o.itemCount} item{o.itemCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <Badge className={STATUS_COLORS[o.status] ?? 'bg-gray-100'}>
                    {o.status}
                  </Badge>
                  <span className="text-sm font-semibold whitespace-nowrap">
                    ${o.total.toFixed(2)}
                  </span>
                  <span className="text-xs text-gray-400">
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
