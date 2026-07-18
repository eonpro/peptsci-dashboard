'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Pagination } from '@/components/Pagination'
import { toast } from 'sonner'
import {
  Truck,
  Search,
  Package,
  Camera,
  Loader2,
  CheckCircle2,
  Plus,
  Zap,
  ArrowRight,
  X,
} from 'lucide-react'
import type { LabelAddress } from '@/components/shipping/FedExLabelModal'
import { FulfillmentOrderRow, type OrderRow } from '@/components/fulfillment/FulfillmentOrderRow'

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
const ManualDispositionModal = dynamic(() => import('@/components/orders/ManualDispositionModal'), {
  ssr: false,
})
const PackPhotoModal = dynamic(() => import('@/components/orders/PackPhotoModal'), {
  ssr: false,
})
import type { StripeQueueRecord } from '@/components/orders/ConvertStripeModal'
import type { PackPhotoOrder } from '@/components/orders/PackPhotoModal'

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

/** Build the label modal's recipient address from an unconverted Stripe record. */
function stripeRecordToLabelAddress(rec: StripeQueueRecord): Partial<LabelAddress> {
  return {
    personName: rec.customerName || '',
    phoneNumber: rec.customerPhone || '',
    address1: rec.address.address || '',
    city: rec.address.city || '',
    state: (rec.address.state || '').toUpperCase(),
    zip: rec.address.zip || '',
  }
}

const filterTabs = [
  { id: 'false', label: 'Needs Label' },
  { id: 'true', label: 'Shipped' },
  { id: 'all', label: 'All' },
  { id: 'stripe', label: 'From Stripe' },
] as const

type TabId = (typeof filterTabs)[number]['id']

type LabelTarget = {
  id: string
  orderNumber: number
  destination?: Partial<LabelAddress>
  /** Whether a contents (packing) photo already exists for this order. */
  hasPhoto?: boolean
}
type NextStep = { orderNumber: number; trackingNumber: string | null; needsPhoto: boolean }

export default function FulfillmentPage() {
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [shipped, setShipped] = useState<TabId>('false')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [meta, setMeta] = useState<{ total: number; totalPages: number }>({
    total: 0,
    totalPages: 1,
  })
  const [queue, setQueue] = useState<StripeQueueRecord[]>([])
  const [labelTarget, setLabelTarget] = useState<LabelTarget | null>(null)
  const [nextStep, setNextStep] = useState<NextStep | null>(null)
  const [newOrderOpen, setNewOrderOpen] = useState(false)
  const [chargeOrder, setChargeOrder] = useState<{ id: string; orderNumber?: number } | null>(null)
  const [refundOrder, setRefundOrder] = useState<{ id: string; orderNumber?: number } | null>(null)
  const [convertRecord, setConvertRecord] = useState<StripeQueueRecord | null>(null)
  const [dispositionOrder, setDispositionOrder] = useState<{
    id: string
    orderNumber: number
    hasPhoto: boolean
  } | null>(null)
  const [packOrder, setPackOrder] = useState<PackPhotoOrder | null>(null)
  const [advancing, setAdvancing] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  // Sequence searches so a slow, older response can't overwrite a newer one.
  const loadSeqRef = useRef(0)

  // Best-effort background refresh of the Stripe queue so the "waiting to be
  // converted" banner shows a count on every tab. Errors are surfaced by the
  // From Stripe tab's own load, not here.
  const loadQueue = useCallback(() => {
    fetch('/api/admin/fulfillment/stripe-queue')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setQueue(data.records ?? [])
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    loadQueue()
  }, [loadQueue])

  // Deep-links like /fulfillment?search=1234 (e.g. from a return's order link)
  // pre-fill the search and widen to the All tab so the order is findable
  // regardless of its shipped state.
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get('search')
    if (initial) {
      setSearch(initial)
      setShipped('all')
    }
  }, [])

  const load = useCallback(() => {
    const seq = ++loadSeqRef.current
    setLoading(true)
    setError(null)
    const url =
      shipped === 'stripe'
        ? '/api/admin/fulfillment/stripe-queue'
        : (() => {
            const qs = new URLSearchParams({
              shipped,
              page: String(page),
              limit: String(pageSize),
            })
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
        if (shipped === 'stripe') {
          setQueue(data.records ?? [])
        } else {
          setOrders(data.orders ?? [])
          setMeta({
            total: data.meta?.total ?? (data.orders?.length ?? 0),
            totalPages: data.meta?.totalPages ?? 1,
          })
          setSelectedIds(new Set())
        }
      })
      .catch((e) => {
        if (seq !== loadSeqRef.current) return
        setError(e instanceof Error ? e.message : 'Failed to load')
      })
      .finally(() => {
        if (seq === loadSeqRef.current) setLoading(false)
      })
  }, [shipped, search, page, pageSize])

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
        // Toast (not setError) so a failed action never wipes the list view.
        toast.error(e instanceof Error ? e.message : 'Failed to update fulfillment')
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

  // Bulk "Mark Picked" over the selected rows that are still pickable.
  const pickableSelected = orders.filter(
    (o) =>
      selectedIds.has(o.id) &&
      (o.fulfillmentStage === 'NOT_STARTED' || o.fulfillmentStage === 'PICKING')
  )
  const bulkMarkPicked = async () => {
    if (pickableSelected.length === 0) return
    setBulkBusy(true)
    let ok = 0
    let failed = 0
    for (const order of pickableSelected) {
      try {
        const r = await fetch(`/api/admin/orders/${order.id}/fulfillment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'pick' }),
        })
        if (!r.ok) throw new Error()
        ok++
      } catch {
        failed++
      }
    }
    setBulkBusy(false)
    if (ok > 0) toast.success(`${ok} order${ok === 1 ? '' : 's'} marked picked`)
    if (failed > 0) toast.error(`${failed} order${failed === 1 ? '' : 's'} failed to update`)
    load()
  }

  // The From Stripe tab loads the whole queue in one shot; apply the search
  // box client-side there so it isn't a dead control on that tab.
  const visibleQueue = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return queue
    return queue.filter((rec) =>
      [rec.customerName, rec.customerEmail, rec.orderRef, rec.product]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    )
  }, [queue, search])

  const photoHref = useMemo(() => {
    if (!nextStep) return '/package-photos'
    const qs = new URLSearchParams({ order: String(nextStep.orderNumber) })
    if (nextStep.trackingNumber) qs.set('tracking', nextStep.trackingNumber)
    return `/package-photos?${qs.toString()}`
  }, [nextStep])

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
              <Camera className="mr-2 h-4 w-4" /> Packing Photos
            </Link>
          </Button>
          <Button onClick={() => setNewOrderOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> New Order
          </Button>
        </div>
      </div>

      {nextStep && (
        <div
          className={`flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
            nextStep.needsPhoto
              ? 'border-amber-400/30 bg-amber-400/10'
              : 'border-emerald-400/30 bg-emerald-400/10'
          }`}
        >
          <div
            className={`flex items-center gap-2 text-sm ${
              nextStep.needsPhoto ? 'text-amber-200' : 'text-emerald-200'
            }`}
          >
            <CheckCircle2
              className={`h-4 w-4 shrink-0 ${nextStep.needsPhoto ? 'text-amber-300' : 'text-emerald-300'}`}
            />
            <span>
              Order #{nextStep.orderNumber} dispositioned
              {nextStep.trackingNumber && (
                <>
                  {' '}· tracking <span className="font-mono">{nextStep.trackingNumber}</span>
                </>
              )}
              {nextStep.needsPhoto
                ? '. No contents photo is on file — photograph the products in the box.'
                : '. Contents photo already on file.'}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {nextStep.needsPhoto && (
              <Button size="sm" asChild>
                <Link href={photoHref}>
                  <Camera className="mr-2 h-4 w-4" /> Capture Contents Photo
                </Link>
              </Button>
            )}
            <button
              onClick={() => setNextStep(null)}
              className={`transition-colors ${
                nextStep.needsPhoto
                  ? 'text-amber-200/70 hover:text-amber-100'
                  : 'text-emerald-200/70 hover:text-emerald-100'
              }`}
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {shipped !== 'stripe' && queue.length > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-amber-200">
            <Zap className="h-4 w-4 shrink-0 text-amber-300" />
            <span>
              <strong>{queue.length}</strong> paid Stripe payment{queue.length === 1 ? '' : 's'} waiting to be
              converted into fulfillable orders.
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 border-amber-400/40 text-amber-200 hover:bg-amber-400/10 hover:text-amber-100"
            onClick={() => setShipped('stripe')}
          >
            Review From Stripe <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <Input
            placeholder="Search by order #, tracking, or client…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="pl-10"
          />
        </div>
        <div className="flex gap-1 rounded-lg border border-white/10 p-1">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setShipped(tab.id)
                setPage(1)
              }}
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
            visibleQueue.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-white/50">
                <Package className="mb-3 h-10 w-10" />
                {search.trim()
                  ? 'No Stripe payments match this search.'
                  : 'No unconverted Stripe payments in this window.'}
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {visibleQueue.map((rec) => (
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
            <div className="flex flex-col items-center py-12 text-center text-white/50">
              <Package className="mb-3 h-10 w-10" />
              <p className="font-medium text-white/70">
                {search.trim() ? 'No orders match this search.' : 'No orders in this view.'}
              </p>
              <p className="mt-1 max-w-sm text-sm">
                {search.trim()
                  ? 'Try a different order #, tracking number, or client name.'
                  : 'Create a manual order, or convert a paid Stripe payment into a fulfillable order.'}
              </p>
              {!search.trim() && (
                <div className="mt-4 flex gap-2">
                  <Button size="sm" onClick={() => setNewOrderOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" /> New Order
                  </Button>
                  {queue.length > 0 && (
                    <Button size="sm" variant="outline" onClick={() => setShipped('stripe')}>
                      <Zap className="mr-2 h-4 w-4" /> Review From Stripe ({queue.length})
                    </Button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              {shipped === 'false' && (
                <div className="flex flex-wrap items-center gap-3 border-b border-white/10 pb-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-white/60">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-brand-primary"
                      checked={selectedIds.size > 0 && selectedIds.size === orders.length}
                      onChange={(e) =>
                        setSelectedIds(
                          e.target.checked ? new Set(orders.map((o) => o.id)) : new Set()
                        )
                      }
                      aria-label="Select all orders on this page"
                    />
                    Select all
                  </label>
                  {selectedIds.size > 0 && (
                    <>
                      <span className="text-sm text-white/50">{selectedIds.size} selected</span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={bulkBusy || pickableSelected.length === 0}
                        onClick={bulkMarkPicked}
                        title={
                          pickableSelected.length === 0
                            ? 'No selected orders are in a pickable stage'
                            : undefined
                        }
                      >
                        {bulkBusy ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                        )}
                        Mark Picked ({pickableSelected.length})
                      </Button>
                    </>
                  )}
                </div>
              )}
              <div className="divide-y divide-white/5">
                {orders.map((order) => (
                  <FulfillmentOrderRow
                    key={order.id}
                    order={order}
                    advancing={advancing}
                    selected={selectedIds.has(order.id)}
                    onSelectChange={
                      shipped === 'false'
                        ? (checked) =>
                            setSelectedIds((prev) => {
                              const next = new Set(prev)
                              if (checked) next.add(order.id)
                              else next.delete(order.id)
                              return next
                            })
                        : undefined
                    }
                    onAdvance={advance}
                    onCharge={() => setChargeOrder({ id: order.id, orderNumber: order.orderNumber })}
                    onRefund={() => setRefundOrder({ id: order.id, orderNumber: order.orderNumber })}
                    onPack={() =>
                      setPackOrder({ id: order.id, orderNumber: order.orderNumber, items: order.items })
                    }
                    onLabel={() =>
                      setLabelTarget({
                        id: order.id,
                        orderNumber: order.orderNumber,
                        destination: toLabelAddress(order),
                        hasPhoto: order.photoCount > 0,
                      })
                    }
                    onDisposition={() =>
                      setDispositionOrder({
                        id: order.id,
                        orderNumber: order.orderNumber,
                        hasPhoto: order.photoCount > 0,
                      })
                    }
                  />
                ))}
              </div>
            </>
          )}
          {shipped !== 'stripe' && !loading && !error && meta.total > 0 && (
            <Pagination
              className="mt-4 border-t border-white/10 pt-4"
              currentPage={page}
              totalPages={meta.totalPages}
              totalItems={meta.total}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size)
                setPage(1)
              }}
            />
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
          onConverted={(order) => {
            // Hand the operator straight to the next step: the new order lands
            // on Needs Label with the Stripe shipping address pre-filled in the
            // label modal.
            const destination = stripeRecordToLabelAddress(convertRecord)
            setConvertRecord(null)
            setShipped('false')
            loadQueue()
            setLabelTarget({ id: order.id, orderNumber: order.orderNumber, destination })
          }}
        />
      )}

      {packOrder && (
        <PackPhotoModal
          open={!!packOrder}
          onOpenChange={(open) => !open && setPackOrder(null)}
          order={packOrder}
          onPacked={() => {
            setPackOrder(null)
            load()
          }}
        />
      )}

      {dispositionOrder && (
        <ManualDispositionModal
          open={!!dispositionOrder}
          onOpenChange={(open) => !open && setDispositionOrder(null)}
          orderId={dispositionOrder.id}
          orderNumber={dispositionOrder.orderNumber}
          onDone={({ orderNumber, outcome, trackingNumber }) => {
            setNextStep({
              orderNumber,
              trackingNumber,
              // Contents photo should exist for every fulfilled order; flag it
              // when the packer never captured one.
              needsPhoto: !dispositionOrder.hasPhoto && outcome === 'SHIPPED',
            })
            setDispositionOrder(null)
            load()
          }}
        />
      )}

      {labelTarget && (
        <FedExLabelModal
          open={!!labelTarget}
          onOpenChange={(open) => !open && setLabelTarget(null)}
          orderId={labelTarget.id}
          orderNumber={labelTarget.orderNumber}
          destination={labelTarget.destination}
          onCreated={({ trackingNumber }) => {
            setNextStep({
              orderNumber: labelTarget.orderNumber,
              trackingNumber: trackingNumber || null,
              needsPhoto: !labelTarget.hasPhoto,
            })
            setLabelTarget(null)
            load()
          }}
        />
      )}
    </div>
  )
}
