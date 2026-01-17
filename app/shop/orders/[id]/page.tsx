'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
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
  Download,
  HelpCircle
} from 'lucide-react'

// Mock order data - in production, this would be fetched from API
const getOrderById = (id: string) => ({
  id,
  date: '2026-01-17',
  status: 'shipped',
  items: [
    { name: 'Semaglutide', dose: '2.5mg', sku: 'SEM-2.5', quantity: 10, price: 89.99 },
    { name: 'Tirzepatide', dose: '5mg', sku: 'TIR-5', quantity: 5, price: 149.99 },
  ],
  subtotal: 1649.85,
  shipping: 0,
  tax: 131.99,
  total: 1781.84,
  tracking: '1Z999AA10123456784',
  shippingAddress: {
    name: 'John Smith',
    company: 'ABC Medical Clinic',
    address1: '123 Healthcare Blvd',
    address2: 'Suite 100',
    city: 'Los Angeles',
    state: 'California',
    zip: '90001',
    phone: '(555) 123-4567',
    email: 'john@abcmedical.com',
  },
  timeline: [
    { date: '2026-01-17T10:00:00', status: 'Order Placed', description: 'Your order has been received' },
    { date: '2026-01-17T14:30:00', status: 'Payment Confirmed', description: 'Payment successfully processed' },
    { date: '2026-01-18T09:00:00', status: 'Processing', description: 'Order is being prepared' },
    { date: '2026-01-18T16:45:00', status: 'Shipped', description: 'Package handed to carrier' },
  ],
})

const statusConfig = {
  processing: { label: 'Processing', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  shipped: { label: 'Shipped', color: 'bg-blue-100 text-blue-700', icon: Truck },
  delivered: { label: 'Delivered', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
}

export default function OrderDetailPage() {
  const params = useParams()
  const orderId = params.id as string
  const order = getOrderById(orderId)

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const status = statusConfig[order.status as keyof typeof statusConfig] || statusConfig.processing
  const StatusIcon = status.icon

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back link */}
      <Link 
        href="/shop/orders" 
        className="inline-flex items-center text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Orders
      </Link>

      {/* Order header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Order {order.id}</h1>
            <Badge className={status.color}>
              <StatusIcon className="mr-1 h-3 w-3" />
              {status.label}
            </Badge>
          </div>
          <p className="text-gray-500 mt-1">Placed on {formatDate(order.date)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Invoice
          </Button>
          <Button variant="outline" size="sm">
            <HelpCircle className="mr-2 h-4 w-4" />
            Get Help
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Order Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative">
                {order.timeline.map((event, idx) => (
                  <div key={idx} className="flex gap-4 pb-6 last:pb-0">
                    {/* Timeline line and dot */}
                    <div className="relative flex flex-col items-center">
                      <div className={`h-3 w-3 rounded-full ${
                        idx === order.timeline.length - 1 
                          ? 'bg-indigo-600 ring-4 ring-indigo-100' 
                          : 'bg-green-500'
                      }`} />
                      {idx < order.timeline.length - 1 && (
                        <div className="absolute top-3 w-0.5 h-full bg-gray-200" />
                      )}
                    </div>
                    
                    {/* Event content */}
                    <div className="flex-1 min-w-0 -mt-1">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-gray-900">{event.status}</p>
                        <p className="text-sm text-gray-500">{formatDateTime(event.date)}</p>
                      </div>
                      <p className="text-sm text-gray-600 mt-0.5">{event.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Tracking info */}
              {order.tracking && (
                <div className="mt-4 p-4 bg-blue-50 rounded-xl">
                  <div className="flex items-center gap-2 text-blue-700">
                    <Truck className="h-5 w-5" />
                    <span className="font-medium">Tracking Number</span>
                  </div>
                  <code className="block mt-2 text-sm bg-white px-3 py-2 rounded-lg border">
                    {order.tracking}
                  </code>
                  <Button variant="link" className="mt-2 p-0 h-auto text-blue-600">
                    Track Package →
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Order Items */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Order Items ({order.items.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-4 p-4 rounded-xl bg-gray-50">
                    <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-xl font-bold text-indigo-300">
                        {item.name.charAt(0)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">{item.name}</p>
                      <p className="text-sm text-gray-500">{item.dose}</p>
                      <p className="text-xs text-gray-400">SKU: {item.sku}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-gray-900">
                        {formatPrice(item.price * item.quantity)}
                      </p>
                      <p className="text-sm text-gray-500">
                        {formatPrice(item.price)} × {item.quantity}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Order Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Order Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span>{formatPrice(order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Shipping</span>
                <span className={order.shipping === 0 ? 'text-green-600' : ''}>
                  {order.shipping === 0 ? 'FREE' : formatPrice(order.shipping)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Tax</span>
                <span>{formatPrice(order.tax)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-semibold text-lg">
                <span>Total</span>
                <span>{formatPrice(order.total)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Shipping Address */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Shipping Address
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-gray-600 space-y-1">
                <p className="font-medium text-gray-900">{order.shippingAddress.name}</p>
                {order.shippingAddress.company && (
                  <p>{order.shippingAddress.company}</p>
                )}
                <p>{order.shippingAddress.address1}</p>
                {order.shippingAddress.address2 && (
                  <p>{order.shippingAddress.address2}</p>
                )}
                <p>
                  {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.zip}
                </p>
                <div className="pt-2 space-y-1">
                  <p>{order.shippingAddress.phone}</p>
                  <p>{order.shippingAddress.email}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Need Help */}
          <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-100">
            <CardContent className="pt-6">
              <div className="text-center">
                <HelpCircle className="h-10 w-10 text-indigo-600 mx-auto mb-3" />
                <h3 className="font-medium text-gray-900">Need Help?</h3>
                <p className="text-sm text-gray-600 mt-1 mb-4">
                  Our support team is here to assist you.
                </p>
                <Button variant="outline" className="w-full">
                  Contact Support
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
