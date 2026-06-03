'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Truck,
  Search,
  Package,
  Camera,
  ExternalLink,
  Loader2,
  Printer,
} from 'lucide-react'
import type { LabelAddress } from '@/components/shipping/FedExLabelModal'

// The FedEx label modal (and its form/stripe deps) only matters once a rep
// opens it; load it on demand instead of in the page's initial bundle.
const FedExLabelModal = dynamic(() => import('@/components/shipping/FedExLabelModal'), {
  ssr: false,
})

type StoredAddress = Record<string, unknown> | null

type OrderRow = {
  id: string
  orderNumber: number
  status: string
  shippingStatus: string | null
  carrier: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  total: number
  createdAt: string
  shippedAt: string | null
  shippingAddress: StoredAddress
  client: { id: string; organizationName: string; contactName: string | null; contactPhone: string | null } | null
  photoCount: number
  labelCount: number
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** Map an order's stored shipping address + client into the modal's address shape. */
function toLabelAddress(order: OrderRow): Partial<LabelAddress> {
  const a = (order.shippingAddress || {}) as Record<string, unknown>
  return {
    personName: str(a.name) || str(a.personName) || order.client?.contactName || order.client?.organizationName || '',
    companyName: str(a.company) || str(a.companyName) || order.client?.organizationName || '',
    phoneNumber: str(a.phone) || str(a.phoneNumber) || order.client?.contactPhone || '',
    address1: str(a.address1) || str(a.line1) || str(a.street),
    address2: str(a.address2) || str(a.line2),
    city: str(a.city),
    state: (str(a.state) || str(a.stateOrProvinceCode)).toUpperCase(),
    zip: str(a.zip) || str(a.postalCode),
  }
}

const filterTabs = [
  { id: 'false', label: 'Needs Label' },
  { id: 'true', label: 'Shipped' },
  { id: 'all', label: 'All' },
] as const

export default function FulfillmentPage() {
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [shipped, setShipped] = useState<'true' | 'false' | 'all'>('false')
  const [modalOrder, setModalOrder] = useState<OrderRow | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    const qs = new URLSearchParams({ shipped })
    if (search.trim()) qs.set('search', search.trim())
    fetch(`/api/admin/orders?${qs.toString()}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.message || data.error || 'Failed to load orders')
        return data
      })
      .then((data) => setOrders(data.orders ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load orders'))
      .finally(() => setLoading(false))
  }, [shipped, search])

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price)
  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const modalDestination = useMemo(() => (modalOrder ? toLabelAddress(modalOrder) : undefined), [modalOrder])

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <Truck className="h-6 w-6" /> Fulfillment
          </h1>
          <p className="mt-1 text-sm text-white/60">
            Create FedEx labels, attach tracking, and review package photos.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/package-photos">
            <Camera className="mr-2 h-4 w-4" /> Capture Package Photo
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <Input
            placeholder="Search by order #, tracking, or client…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-1 rounded-lg border border-white/10 p-1">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setShipped(tab.id)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                shipped === tab.id ? 'bg-[#213cef] text-white' : 'text-white/60 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Orders</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-white/60">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
            </div>
          ) : error ? (
            <p className="py-8 text-center text-red-400">{error}</p>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-white/50">
              <Package className="mb-3 h-10 w-10" />
              No orders found.
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {orders.map((order) => (
                <div key={order.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">Order #{order.orderNumber}</span>
                      <Badge variant="outline" className="text-xs">{order.status}</Badge>
                      {order.photoCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-white/50">
                          <Camera className="h-3 w-3" /> {order.photoCount}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-white/60">
                      {order.client?.organizationName || 'Unknown client'} · {formatDate(order.createdAt)} ·{' '}
                      {formatPrice(order.total)}
                    </p>
                    {order.trackingNumber && (
                      <div className="mt-1 flex items-center gap-2 text-xs">
                        <Truck className="h-3 w-3 text-blue-400" />
                        <span className="text-white/50">{order.carrier || 'Tracking'}:</span>
                        {order.trackingUrl ? (
                          <a
                            href={order.trackingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-mono text-blue-400 hover:underline"
                          >
                            {order.trackingNumber}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="font-mono text-white/70">{order.trackingNumber}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setModalOrder(order)}>
                      <Printer className="mr-2 h-4 w-4" />
                      {order.trackingNumber ? 'New Label' : 'Create Label'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {modalOrder && (
        <FedExLabelModal
          open={!!modalOrder}
          onOpenChange={(open) => !open && setModalOrder(null)}
          orderId={modalOrder.id}
          orderNumber={modalOrder.orderNumber}
          destination={modalDestination}
          onCreated={() => {
            setModalOrder(null)
            load()
          }}
        />
      )}
    </div>
  )
}
