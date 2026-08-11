'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Users } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type CustomerRow = {
  id: string
  displayName: string
  email: string | null
  city: string | null
  state: string | null
  orderCount: number
  lastOrderAt: string | null
}

/**
 * Admin practice page — end-customers (Patients) with order counts.
 */
export function ClientCustomersCard({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true)
  const [customers, setCustomers] = useState<CustomerRow[]>([])

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/customers`)
      if (!res.ok) return
      const data = await res.json()
      setCustomers(data.customers ?? [])
    } catch {
      // non-critical card
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Card className="rounded-2xl border-white/10 bg-white/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Users className="h-5 w-5" />
          Customers
        </CardTitle>
        <CardDescription className="text-white/50">
          Ship-to recipients from Shopify and patient orders for this practice.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-white/50">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : customers.length === 0 ? (
          <p className="text-sm text-white/40">No customers linked yet.</p>
        ) : (
          <ul className="divide-y divide-white/10">
            {customers.slice(0, 25).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate font-medium text-white">{c.displayName}</p>
                  <p className="truncate text-xs text-white/50">
                    {[c.email, [c.city, c.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ') ||
                      '—'}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 border-white/20 text-xs text-white/70">
                  {c.orderCount} order{c.orderCount === 1 ? '' : 's'}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        {!loading && customers.length > 0 && (
          <p className="mt-3 text-xs text-white/40">
            Clinics see the full CRM under Client Portal →{' '}
            <Link href="/shop/customers" className="text-brand-primary underline">
              Customers
            </Link>
            .
          </p>
        )}
      </CardContent>
    </Card>
  )
}
