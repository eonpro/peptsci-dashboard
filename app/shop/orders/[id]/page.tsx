'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft,
  Package,
  Truck,
  CheckCircle2,
  Clock,
  MapPin,
  Receipt,
  Camera,
  Loader2,
  XCircle,
  CreditCard,
  FileText,
  RotateCcw,
} from 'lucide-react'
import { BuyAgainButton } from '@/components/shop/BuyAgainButton'
import { RequestReturnDialog } from '@/components/shop/RequestReturnDialog'

type OrderItem = {
  id: string
  variantId: string
  name: string
  dose: string | null
  sku: string | null
  quantity: number
  unitPrice: number
  total: number
}

type OrderReturn = {
  id: string
  rmaNumber: string
  status: string
  reason: string | null
  createdAt: string
  items: { productName: string; quantity: number }[]
}

type PackagePhoto = { id: string; url: string; notes: string | null; createdAt: string }

type StoredAddress = {
  name?: string | null
  company?: string | null
  companyName?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  phone?: string | null
  phoneNumber?: string | null
  email?: string | null
}

type OrderPayment = {
  status: string
  paidAt: string | null
  card: string | null
  invoice: { id: string; number: string; status: string; dueDate: string | null } | null
}

type OrderDetail = {
  id: string
  orderNumber: number
  status: string
  shippingStatus: string | null
  subtotal: number
  taxTotal: number
  shippingTotal: number
  total: number
  carrier: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  shippedAt: string | null
  createdAt: string
  submittedAt: string | null
  approvedAt: string | null
  fulfilledAt: string | null
  shippingAddress: StoredAddress | null
  payment?: OrderPayment
  items: OrderItem[]
  packagePhotos: PackagePhoto[]
}

const statusBadge = (order: OrderDetail) => {
  if (order.status === 'CANCELLED' || order.status === 'REJECTED')
    return { label: 'Cancelled', color: 'bg-red-100 text-red-700', icon: XCircle }
  if (order.status === 'COMPLETED' || order.shippingStatus === 'DELIVERED')
    return { label: 'Delivered', color: 'bg-green-100 text-green-700', icon: CheckCircle2 }
  if (order.status === 'SHIPPED' || order.trackingNumber)
    return { label: 'Shipped', color: 'bg-blue-100 text-blue-700', icon: Truck }
  return { label: 'Processing', color: 'bg-yellow-100 text-yellow-700', icon: Clock }
}

export default function OrderDetailPage() {
  const params = useParams()
  const orderId = params.id as string
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [returns, setReturns] = useState<OrderReturn[]>([])
  const [canRequestReturn, setCanRequestReturn] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)

  const loadReturns = (id: string) =>
    fetch(`/api/shop/orders/${id}/returns`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return
        setReturns(data.returns ?? [])
        setCanRequestReturn(Boolean(data.canRequest))
      })
      .catch(() => {})

  useEffect(() => {
    let active = true
    fetch(`/api/shop/orders/${orderId}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.message || data.error || 'Failed to load order')
        return data
      })
      .then((data) => active && setOrder(data.order))
      .catch((e) => active && setError(e instanceof Error ? e.message : 'Failed to load order'))
      .finally(() => active && setLoading(false))
    void loadReturns(orderId)
    return () => {
      active = false
    }
  }, [orderId])

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price)
  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const formatDateTime = (dateStr: string) =>
    new Date(dateStr).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-20 text-center text-gray-500">
        <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" />
        Loading order…
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Link href="/shop/orders" className="inline-flex items-center text-sm text-gray-500 hover:text-gray-900">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Orders
        </Link>
        <Card>
          <CardContent className="py-12 text-center text-red-600">{error || 'Order not found'}</CardContent>
        </Card>
      </div>
    )
  }

  const status = statusBadge(order)
  const StatusIcon = status.icon
  const addr = order.shippingAddress || {}

  const timeline = [
    order.createdAt && { date: order.createdAt, label: 'Order Placed', desc: 'Your order has been received' },
    order.submittedAt && { date: order.submittedAt, label: 'Submitted', desc: 'Order submitted for review' },
    order.approvedAt && { date: order.approvedAt, label: 'Approved', desc: 'Order approved' },
    order.fulfilledAt && { date: order.fulfilledAt, label: 'Fulfilled', desc: 'Order prepared for shipment' },
    order.shippedAt && { date: order.shippedAt, label: 'Shipped', desc: 'Package handed to carrier' },
  ].filter(Boolean) as { date: string; label: string; desc: string }[]

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link href="/shop/orders" className="inline-flex items-center text-sm text-gray-500 hover:text-gray-900">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Orders
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Order #{order.orderNumber}</h1>
            <Badge className={status.color}>
              <StatusIcon className="mr-1 h-3 w-3" />
              {status.label}
            </Badge>
          </div>
          <p className="text-gray-500 mt-1">Placed on {formatDate(order.createdAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          {canRequestReturn && (
            <Button variant="outline" onClick={() => setReturnOpen(true)}>
              <RotateCcw className="mr-2 h-4 w-4" /> Request Return
            </Button>
          )}
          <BuyAgainButton orderId={order.id} size="default" />
        </div>
      </div>

      {returns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <RotateCcw className="h-5 w-5" /> Returns
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {returns.map((r) => (
              <div
                key={r.id}
                className="flex flex-col gap-1 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <span className="font-mono font-medium">{r.rmaNumber}</span>
                  <span className="ml-2 text-gray-500">
                    {r.items.map((it) => `${it.quantity}× ${it.productName}`).join(', ')}
                  </span>
                </div>
                <Badge variant="outline" className="w-fit">
                  {r.status.replaceAll('_', ' ')}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" /> Order Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative">
                {timeline.map((event, idx) => (
                  <div key={idx} className="flex gap-4 pb-6 last:pb-0">
                    <div className="relative flex flex-col items-center">
                      <div
                        className={`h-3 w-3 rounded-full ${
                          idx === timeline.length - 1 ? 'bg-indigo-600 ring-4 ring-indigo-100' : 'bg-green-500'
                        }`}
                      />
                      {idx < timeline.length - 1 && <div className="absolute top-3 w-0.5 h-full bg-gray-200" />}
                    </div>
                    <div className="flex-1 min-w-0 -mt-1">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-gray-900">{event.label}</p>
                        <p className="text-sm text-gray-500">{formatDateTime(event.date)}</p>
                      </div>
                      <p className="text-sm text-gray-600 mt-0.5">{event.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {order.trackingNumber && (
                <div className="mt-4 p-4 bg-blue-50 rounded-xl">
                  <div className="flex items-center gap-2 text-blue-700">
                    <Truck className="h-5 w-5" />
                    <span className="font-medium">{order.carrier || 'Tracking'} Number</span>
                  </div>
                  <code className="block mt-2 text-sm bg-white px-3 py-2 rounded-lg border">
                    {order.trackingNumber}
                  </code>
                  {order.trackingUrl && (
                    <Button variant="link" className="mt-2 p-0 h-auto text-blue-600" asChild>
                      <a href={order.trackingUrl} target="_blank" rel="noopener noreferrer">
                        Track Package →
                      </a>
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Package photos — proof of shipment */}
          {order.packagePhotos.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="h-5 w-5" /> Package Photos ({order.packagePhotos.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {order.packagePhotos.map((photo) => (
                    <a
                      key={photo.id}
                      href={photo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative block aspect-square overflow-hidden rounded-xl border bg-gray-50"
                    >
                      <Image
                        src={photo.url}
                        alt={`Package photo from ${formatDate(photo.createdAt)}`}
                        fill
                        unoptimized
                        className="object-cover transition-transform group-hover:scale-105"
                      />
                    </a>
                  ))}
                </div>
                <p className="mt-3 text-xs text-gray-500">
                  Photos captured by our fulfillment team before shipment.
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" /> Order Items ({order.items.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-4 p-4 rounded-xl bg-gray-50">
                    <div className="h-16 w-16 rounded-xl bg-linear-to-br from-indigo-100 to-purple-100 flex items-center justify-center shrink-0">
                      <span className="text-xl font-bold text-indigo-300">{item.name.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">{item.name}</p>
                      {item.dose && <p className="text-sm text-gray-500">{item.dose}</p>}
                      {item.sku && <p className="text-xs text-gray-400">SKU: {item.sku}</p>}
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-gray-900">{formatPrice(item.total)}</p>
                      <p className="text-sm text-gray-500">
                        {formatPrice(item.unitPrice)} × {item.quantity}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" /> Order Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span>{formatPrice(order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Shipping</span>
                <span className={order.shippingTotal === 0 ? 'text-green-600' : ''}>
                  {order.shippingTotal === 0 ? 'FREE' : formatPrice(order.shippingTotal)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Tax</span>
                <span>{formatPrice(order.taxTotal)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-semibold text-lg">
                <span>Total</span>
                <span>{formatPrice(order.total)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Payment */}
          {order.payment && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" /> Payment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {order.payment.invoice ? (
                  <>
                    <p className="text-gray-900 font-medium flex items-center gap-2">
                      <FileText className="h-4 w-4 text-gray-400" /> Billed to account
                    </p>
                    <p className="text-gray-600">
                      Invoice {order.payment.invoice.number}
                      {order.payment.invoice.dueDate
                        ? ` · due ${formatDate(order.payment.invoice.dueDate)}`
                        : ''}
                    </p>
                    <Badge
                      className={
                        order.payment.invoice.status === 'PAID'
                          ? 'bg-green-100 text-green-700'
                          : order.payment.invoice.status === 'OVERDUE'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-blue-100 text-blue-700'
                      }
                    >
                      {order.payment.invoice.status}
                    </Badge>
                    <Button variant="link" className="p-0 h-auto text-indigo-600 block" asChild>
                      <Link href="/shop/invoices">View &amp; pay invoices →</Link>
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-gray-900 font-medium">
                      {order.payment.card ?? 'Card payment'}
                    </p>
                    <Badge
                      className={
                        order.payment.status === 'CAPTURED'
                          ? 'bg-green-100 text-green-700'
                          : order.payment.status === 'FAILED'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-700'
                      }
                    >
                      {order.payment.status === 'CAPTURED'
                        ? `Paid${order.payment.paidAt ? ` ${formatDate(order.payment.paidAt)}` : ''}`
                        : order.payment.status}
                    </Badge>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {order.shippingAddress && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" /> Shipping Address
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-gray-600 space-y-1">
                  {(addr.name || addr.company || addr.companyName) && (
                    <p className="font-medium text-gray-900">{addr.name || addr.company || addr.companyName}</p>
                  )}
                  {addr.address1 && <p>{addr.address1}</p>}
                  {addr.address2 && <p>{addr.address2}</p>}
                  {(addr.city || addr.state || addr.zip) && (
                    <p>
                      {addr.city}
                      {addr.city && (addr.state || addr.zip) ? ', ' : ''}
                      {addr.state} {addr.zip}
                    </p>
                  )}
                  <div className="pt-2 space-y-1">
                    {(addr.phone || addr.phoneNumber) && <p>{addr.phone || addr.phoneNumber}</p>}
                    {addr.email && <p>{addr.email}</p>}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <RequestReturnDialog
        open={returnOpen}
        onOpenChange={setReturnOpen}
        orderId={order.id}
        orderNumber={order.orderNumber}
        items={order.items.map((it) => ({
          id: it.id,
          name: it.name,
          dose: it.dose,
          quantity: it.quantity,
        }))}
        onCreated={() => void loadReturns(order.id)}
      />
    </div>
  )
}
