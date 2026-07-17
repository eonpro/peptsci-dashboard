'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Store,
  Palette,
  Package,
  DollarSign,
  ShoppingCart,
  ExternalLink,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface ClinicStorefront {
  id: string
  slug: string
  name: string
  status: 'DRAFT' | 'ACTIVE' | 'SUSPENDED'
  client: { organizationName: string }
  _count: { products: number; retailOrders: number; endCustomers: number }
}

export default function StorefrontManagePage() {
  const [sf, setSf] = useState<ClinicStorefront | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/clinic/storefront')
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json()
          setError(data.message || 'No storefront assigned')
          return
        }
        setSf(await res.json())
      })
      .catch(() => setError('Failed to load storefront'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="h-8 bg-white/10 rounded w-1/3 animate-pulse" />
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-white/5 rounded animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !sf) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <AlertCircle className="h-12 w-12 text-white/30 mb-4" />
            <h2 className="text-lg font-medium text-white">No Storefront Available</h2>
            <p className="text-sm text-white/60 mt-1">
              {error || 'Contact PeptSci admin to set up your white-label storefront.'}
            </p>
            <Link href="/shop" className="mt-4">
              <Button variant="outline">Back to Shop</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const sections = [
    {
      title: 'Branding',
      description: 'Logo, colors, fonts, hero, and footer',
      icon: Palette,
      href: '/shop/storefront-manage/branding',
      color: 'bg-purple-500/20 text-purple-300',
    },
    {
      title: 'Products',
      description: 'Choose which products to show',
      icon: Package,
      href: '/shop/storefront-manage/products',
      color: 'bg-blue-500/20 text-blue-300',
      count: sf._count.products,
    },
    {
      title: 'Pricing',
      description: 'Set retail prices for your customers',
      icon: DollarSign,
      href: '/shop/storefront-manage/pricing',
      color: 'bg-green-500/20 text-green-300',
    },
    {
      title: 'Orders',
      description: 'View orders from your storefront',
      icon: ShoppingCart,
      href: '/shop/storefront-manage/orders',
      color: 'bg-amber-500/20 text-amber-300',
      count: sf._count.retailOrders,
    },
  ]

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{sf.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={sf.status === 'ACTIVE' ? 'default' : 'secondary'}>{sf.status}</Badge>
            <span className="text-sm text-white/60">{sf.slug}.peptsci.com</span>
          </div>
        </div>
        {sf.status === 'ACTIVE' && (
          <a href={`https://${sf.slug}.peptsci.com`} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="gap-2">
              <ExternalLink className="h-4 w-4" />
              Visit Store
            </Button>
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {sections.map((s) => {
          const Icon = s.icon
          return (
            <Link key={s.href} href={s.href}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className={`p-2 rounded-lg ${s.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    {s.count !== undefined && (
                      <span className="text-2xl font-bold text-white">{s.count}</span>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <CardTitle className="text-base">{s.title}</CardTitle>
                  <CardDescription className="mt-1">{s.description}</CardDescription>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
