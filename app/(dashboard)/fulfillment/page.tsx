'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  ClipboardList,
  FileText,
  CheckCircle2,
  Plus,
  CreditCard,
  Undo2,
} from 'lucide-react'
import type { LabelAddress } from '@/components/shipping/FedExLabelModal'

// The FedEx label modal (and its form/stripe deps) only matters once a rep
// opens it; load it on demand instead of in the page's initial bundle.
const FedExLabelModal = dynamic(() => import('@/components/shipping/FedExLabelModal'), {
  ssr: false,
})
const NewOrderModal = dynamic(() => import('@/components/orders/NewOrderModal'), {
  ssr: false,
})
const ChargeOrderModal = dynamic(() => import('@/components/orders/ChargeOrderModal'), {
  ssr: false,
})
const RefundOrderModal = dynamic(() => import('@/components/orders/RefundOrderModal'), {
  ssr: false,
})
const ConvertStripeModal = dynamic(() => import('@/components/orders/ConvertStripeModal'), {
  ssr: false,
})
import type { StripeQueueRecord } from '@/components/orders/ConvertStripeModal'

type StoredAddress = Record<string, unknown> | null

type OrderRow = {
  id: string
  orderNumber: number
  status: string
  paymentStatus: string
  shippingStatus: string | null
  carrier: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  total: number
  createdAt: string
  shippedAt: string | null
  shippingAddress: StoredAddress
  client: { id: string; organizationName: string; contactName: string | null; contactPhone: string | null } | null
  fulfillmentStage: 'NOT_STARTED' | 'PICKING' | 'PICKED' | 'PACKED'
  photoCount: number
  labelCount: number
}

const STAGE_META: Record<OrderRow['fulfillmentStage'], { label: string; className: string }> = {
  NOT_STARTED: { label: 'Not started', className: 'border-white/15 text-white/50' },
  PICKING: { label: 'Picking', className: 'border-amber-400/40 text-amber-300' },
  PICKED: { label: 'Picked', className: 'border-sky-400/40 text-sky-300' },
  PACKED: { label: 'Packed', className: 'border-emerald-400/40 text-emerald-300' },
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
  { id: 'stripe', label: 'From Stripe' },
] as const

type TabId = (typeof filterTabs)[number]['id']

export default function FulfillmentPage() {
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [shipped, setShipped] = useState<TabId>('false')
  const [queue, setQueue] = useState<StripeQueueRecord[]>([])
  const [modalOrder, setModalOrder] = useState<OrderRow | null>(null)
  const [newOrderOpen, setNewOrderOpen] = useState(false)
  const [chargeOrder, setChargeOrder] = useState<{ id: string; orderNumber?: number } | null>(null)
  const [refundOrder, setRefundOrder] = useState<{ id: string; orderNumber?: number } | null>(null)
  const [convertRecord, setConvertRecord] = useState<StripeQueueRecord | null>(null)
  const [advancing, setAdvancing] = useState<string | null>(null)
  // Sequence searches so a slow, older response can't overwrite a newer one.
  const loadSeqRef = useRef(0)

  const load = useCallback(() => {
    const seq = ++loadSeqRef.current
    setLoading(true)
    setError(null)
    const url =
      shipped === 'stripe'
        ? '/api/admin/fulfillment/stripe-queue'
        : (() => {
            const qs = new URLSearchParams({ shipped })
            if (search.trim()) qs.set('search', search.trim())
            return `/api/admin/orders?${qs.toString()}`
          })()
    fetch(url)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.message || data.error || 'Failed to load')
        return data
      })
      .then((data) => {
        if (seq !== loadSeqRef.current) return
        if (shipped === 'stripe') setQueue(data.records ?? [])
        else setOrders(data.orders ?? [])
      })
      .catch((e) => {
        if (seq !== loadSeqRef.current) return
        setError(e instanceof Error ? e.message : 'Failed to load')
      })
      .finally(() => {
        if (seq === loadSeqRef.current) setLoading(false)
      })
  }, [shipped, search])

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  const advance = useCallback(
    async (orderId: string, action: 'pick' | 'pack' | 'reset') => {
      setAdvancing(`${orderId}:${action}`)
      try {
        const r = await fetch(`/api/admin/orders/${orderId}/fulfillment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        })
        if (!r.ok) {
          const data = await r.json().catch(() => ({}))
          throw new Error(data.message || data.error || 'Failed to update fulfillment')
        }
        load()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to update fulfillment')
      } finally {
        setAdvancing(null)
      }
    },
    [load]
  )

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
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/package-photos">
              <Camera className="mr-2 h-4 w-4" /> Capture Package Photo
            </Link>
          </Button>
          <Button onClick={() => setNewOrderOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> New Order
          </Button>
        </div>
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
                shipped === tab.id ? 'bg-brand-primary text-white' : 'text-white/60 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {shipped === 'stripe' ? 'Stripe payments to fulfill' : 'Orders'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-white/60">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
            </div>
          ) : error ? (
            <p className="py-8 text-center text-red-400">{error}</p>
          ) : shipped === 'stripe' ? (
            queue.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-white/50">
                <Package className="mb-3 h-10 w-10" />
                No unconverted Stripe payments in this window.
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {queue.map((rec) => (
                  <div key={rec.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{rec.customerName || rec.customerEmail || 'Unknown customer'}</span>
                        <Badge variant="outline" className="text-xs">{rec.orderRef}</Badge>
                        <Badge variant="outline" className="border-emerald-400/40 text-xs text-emerald-300">Paid</Badge>
                        {rec.matchedClient && (
                          <Badge variant="outline" className="border-sky-400/40 text-xs text-sky-300">Client matched</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-sm text-white/60">
                        {rec.product || 'No line detail'}{rec.vials ? ` · ${rec.vials} vials` : ''} · {formatDate(rec.date ?? new Date().toISOString())} · {formatPrice(rec.paidAmount)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center justify-end gap-2">
                      <Button size="sm" onClick={() => setConvertRecord(rec)}>
                        <CheckCircle2 className="mr-2 h-4 w-4" /> Convert to Order
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )
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
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          order.paymentStatus === 'CAPTURED'
                            ? 'border-emerald-400/40 text-emerald-300'
                            : order.paymentStatus === 'REFUNDED'
                              ? 'border-white/20 text-white/50'
                              : 'border-amber-400/40 text-amber-300'
                        }`}
                      >
                        {order.paymentStatus === 'CAPTURED'
                          ? 'Paid'
                          : order.paymentStatus === 'REFUNDED'
                            ? 'Refunded'
                            : 'Unpaid'}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-xs ${STAGE_META[order.fulfillmentStage].className}`}
                      >
                        {STAGE_META[order.fulfillmentStage].label}
                      </Badge>
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
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    <Button size="sm" variant="ghost" asChild>
                      <a
                        href={`/api/admin/orders/${order.id}/pick-list/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ClipboardList className="mr-2 h-4 w-4" /> Pick List
                      </a>
                    </Button>
                    <Button size="sm" variant="ghost" asChild>
                      <a
                        href={`/api/admin/orders/${order.id}/packing-slip/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <FileText className="mr-2 h-4 w-4" /> Packing Slip
                      </a>
                    </Button>
                    {order.paymentStatus !== 'CAPTURED' && order.paymentStatus !== 'REFUNDED' && (
                      <Button size="sm" variant="outline" onClick={() => setChargeOrder({ id: order.id, orderNumber: order.orderNumber })}>
                        <CreditCard className="mr-2 h-4 w-4" /> Take Payment
                      </Button>
                    )}
                    {order.paymentStatus === 'CAPTURED' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-white/50 hover:text-red-300"
                        onClick={() => setRefundOrder({ id: order.id, orderNumber: order.orderNumber })}
                      >
                        <Undo2 className="mr-2 h-4 w-4" /> Refund
                      </Button>
                    )}
                    {order.fulfillmentStage === 'NOT_STARTED' || order.fulfillmentStage === 'PICKING' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={advancing === `${order.id}:pick`}
                        onClick={() => advance(order.id, 'pick')}
                      >
                        {advancing === `${order.id}:pick` ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                        )}
                        Mark Picked
                      </Button>
                    ) : order.fulfillmentStage === 'PICKED' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={advancing === `${order.id}:pack`}
                        onClick={() => advance(order.id, 'pack')}
                      >
                        {advancing === `${order.id}:pack` ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                        )}
                        Mark Packed
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={advancing === `${order.id}:reset`}
                        onClick={() => advance(order.id, 'reset')}
                      >
                        Reset
                      </Button>
                    )}
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

      <NewOrderModal
        open={newOrderOpen}
        onOpenChange={setNewOrderOpen}
        onCreated={(orderId) => {
          setShipped('false')
          load()
          // Immediately offer to collect payment for the new order.
          setChargeOrder({ id: orderId })
        }}
      />

      {chargeOrder && (
        <ChargeOrderModal
          open={!!chargeOrder}
          onOpenChange={(open) => !open && setChargeOrder(null)}
          orderId={chargeOrder.id}
          orderNumber={chargeOrder.orderNumber}
          onPaid={load}
        />
      )}

      {refundOrder && (
        <RefundOrderModal
          open={!!refundOrder}
          onOpenChange={(open) => !open && setRefundOrder(null)}
          orderId={refundOrder.id}
          orderNumber={refundOrder.orderNumber}
          onRefunded={load}
        />
      )}

      {convertRecord && (
        <ConvertStripeModal
          open={!!convertRecord}
          onOpenChange={(open) => !open && setConvertRecord(null)}
          record={convertRecord}
          onConverted={load}
        />
      )}

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
