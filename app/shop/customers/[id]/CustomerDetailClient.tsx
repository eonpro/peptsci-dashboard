'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, MapPin, Mail, Phone, Package, ExternalLink } from 'lucide-react'
import type { ShopCustomerDetail } from '@/lib/shop-customers'

function formatPrice(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function CustomerDetailClient({ customer }: { customer: ShopCustomerDetail }) {
  const addr = customer.address

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="mb-2 -ml-2 text-white/60" asChild>
          <Link href="/shop/customers">
            <ArrowLeft className="mr-1 h-4 w-4" /> Customers
          </Link>
        </Button>
        <h1 className="text-3xl font-bold text-white">{customer.displayName}</h1>
        <p className="mt-1 text-white/60">
          {customer.orderCount} order{customer.orderCount === 1 ? '' : 's'}
          {customer.lastOrderAt ? ` · last ${formatDate(customer.lastOrderAt)}` : ''}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-white">Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-white/70">
            {customer.email ? (
              <p className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-white/40" />
                {customer.email}
              </p>
            ) : (
              <p className="text-white/40">No email on file</p>
            )}
            {customer.phone && (
              <p className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-white/40" />
                {customer.phone}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-white">
              <MapPin className="h-4 w-4" /> Ship-to address
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-white/70">
            {addr?.address1 ? (
              <>
                <p className="font-medium text-white">{customer.displayName}</p>
                <p>{addr.address1}</p>
                {addr.address2 && <p>{addr.address2}</p>}
                <p>
                  {[addr.city, addr.state].filter(Boolean).join(', ')} {addr.zip}
                </p>
              </>
            ) : (
              <p className="text-white/40">No address on file</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-white">Orders</h2>
        {customer.orders.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-white/50">No orders yet</CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {customer.orders.map((o) => (
              <Card key={o.id}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-white">#{o.orderNumber}</span>
                      {o.source === 'SHOPIFY' && (
                        <Badge
                          variant="outline"
                          className="border-violet-400/40 text-xs text-violet-300"
                        >
                          Shopify{o.shopifyOrderName ? ` ${o.shopifyOrderName}` : ''}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs text-white/60">
                        {o.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-white/55">
                      {formatDate(o.createdAt)} · {formatPrice(o.total)}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-white/70">
                      {o.items
                        .map((it) => `${it.quantity}× ${it.name}${it.dose ? ` ${it.dose}` : ''}`)
                        .join(' · ')}
                    </p>
                    {o.trackingNumber && (
                      <p className="mt-1 text-xs text-white/50">
                        Tracking {o.trackingNumber}
                        {o.trackingUrl && (
                          <a
                            href={o.trackingUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-2 inline-flex items-center gap-0.5 text-brand-primary underline"
                          >
                            Track <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </p>
                    )}
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/shop/orders/${o.id}`}>
                      <Package className="mr-1 h-3.5 w-3.5" /> View order
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
