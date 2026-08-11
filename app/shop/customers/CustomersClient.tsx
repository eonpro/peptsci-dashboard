'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search, Users, ChevronRight, MapPin, Mail } from 'lucide-react'
import type { ShopCustomerListItem } from '@/lib/shop-customers'

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function CustomersClient({ customers }: { customers: ShopCustomerListItem[] }) {
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return customers
    return customers.filter((c) => {
      const hay = [
        c.displayName,
        c.email,
        c.phone,
        c.city,
        c.state,
        String(c.orderCount),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(needle)
    })
  }, [customers, q])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Customers</h1>
        <p className="mt-1 text-white/60">
          Ship-to recipients from Shopify and patient orders — name, contact, and order history.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
        <Input
          className="h-11 rounded-xl border-white/10 bg-white/5 pl-10 text-white"
          placeholder="Search name, email, city…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="mb-4 rounded-full bg-white/10 p-6">
              <Users className="h-12 w-12 text-white/40" />
            </div>
            <h3 className="text-lg font-medium text-white">No customers yet</h3>
            <p className="mt-1 max-w-sm text-center text-white/60">
              {q
                ? 'Try a different search'
                : 'When paid Shopify orders (or patient ship-to orders) sync, customers appear here.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <Link key={c.id} href={`/shop/customers/${c.id}`} className="block">
              <Card className="overflow-hidden transition-shadow hover:shadow-md">
                <CardContent className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-white">{c.displayName}</p>
                      {c.orderCount > 0 ? (
                        <Badge
                          variant="outline"
                          className="border-white/20 text-xs text-white/70"
                        >
                          {c.orderCount} order{c.orderCount === 1 ? '' : 's'}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-white/10 text-xs text-white/40">
                          No orders
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/55">
                      {(c.city || c.state) && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {[c.city, c.state].filter(Boolean).join(', ')}
                        </span>
                      )}
                      {c.email && (
                        <span className="inline-flex items-center gap-1 truncate">
                          <Mail className="h-3.5 w-3.5" />
                          {c.email}
                        </span>
                      )}
                      {c.lastOrderAt && <span>Last order {formatDate(c.lastOrderAt)}</span>}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-white/40" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
