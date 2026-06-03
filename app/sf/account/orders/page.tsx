'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, ShoppingBag, Package } from 'lucide-react'
import { useStorefront } from '@/components/storefront/StorefrontContext'

interface OrderItem {
  productName: string
  sku: string | null
  quantity: number
  unitPrice: number
  total: number
}

interface OrderRow {
  id: string
  orderNumber: string
  status: string
  subtotal: number
  taxTotal: number
  shippingTotal: number
  total: number
  itemCount: number
  items: OrderItem[]
  createdAt: string
}

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  CONFIRMED: 'bg-blue-100 text-blue-800',
  PROCESSING: 'bg-purple-100 text-purple-800',
  SHIPPED: 'bg-indigo-100 text-indigo-800',
  DELIVERED: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-red-100 text-red-800',
}

export default function OrdersPage() {
  const { config, session } = useStorefront()
  const branding = config?.branding
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session?.token) {
      setLoading(false)
      return
    }
    fetch('/api/storefront/account/orders', {
      headers: { Authorization: `Bearer ${session.token}` },
    })
      .then(async (res) => {
        if (res.ok) setOrders(await res.json())
      })
      .finally(() => setLoading(false))
  }, [session])

  if (!session) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-gray-500 mb-4">Please sign in to view your orders.</p>
        <Link
          href="/account"
          className="inline-block px-6 py-2 rounded-lg text-white text-sm font-medium"
          style={{ backgroundColor: branding?.colors.primary }}
        >
          Sign In
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link
        href="/account"
        className="inline-flex items-center gap-2 text-sm mb-6 opacity-60 hover:opacity-100 transition-opacity"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Account
      </Link>

      <h1 className="text-2xl font-bold mb-6">Order History</h1>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16">
          <ShoppingBag className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No orders yet</p>
          <Link
            href="/"
            className="inline-block mt-4 px-6 py-2 rounded-lg text-white text-sm font-medium"
            style={{ backgroundColor: branding?.colors.primary }}
          >
            Start Shopping
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div key={order.id} className="border rounded-xl p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-medium text-sm">{order.orderNumber}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(order.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLE[order.status] ?? 'bg-gray-100 text-gray-700'}`}>
                    {order.status}
                  </span>
                  <span className="font-semibold">${order.total.toFixed(2)}</span>
                </div>
              </div>
              <div className="space-y-1">
                {order.items.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
                    <Package className="h-3.5 w-3.5 text-gray-400" />
                    <span>{item.productName}</span>
                    <span className="text-gray-400">x{item.quantity}</span>
                    <span className="ml-auto text-gray-500">${item.total.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
