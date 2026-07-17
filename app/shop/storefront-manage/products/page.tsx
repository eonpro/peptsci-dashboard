'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Star, StarOff, Eye, EyeOff, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { StorefrontProductItem } from '@/lib/types/storefront'

interface AvailableVariant {
  id: string
  sku: string | null
  dose: string | null
  unitSize: string | null
  srp: number
  productName: string
  category: string | null
}

export default function ProductCurationPage() {
  const [sfProducts, setSfProducts] = useState<StorefrontProductItem[]>([])
  const [available, setAvailable] = useState<AvailableVariant[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  const fetchProducts = useCallback(async () => {
    try {
      const [sfRes, priceRes] = await Promise.all([
        fetch('/api/clinic/storefront/products'),
        fetch('/api/prices'),
      ])
      if (sfRes.ok) setSfProducts(await sfRes.json())
      if (priceRes.ok) {
        const data = await priceRes.json()
        const prices = data.prices || data
        setAvailable(
          (prices as { id: string; sku: string; productName: string; dose: string; srp: number }[]).map(
            (p) => ({
              id: p.id,
              sku: p.sku,
              dose: p.dose,
              unitSize: null,
              srp: p.srp,
              productName: p.productName,
              category: null,
            })
          )
        )
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  const addedVariantIds = new Set(sfProducts.map((p) => p.variantId))

  async function toggleProduct(variantId: string, isEnabled: boolean) {
    setSaving(true)
    try {
      await fetch('/api/clinic/storefront/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variantId, isEnabled }),
      })
      fetchProducts()
    } finally {
      setSaving(false)
    }
  }

  async function toggleFeatured(variantId: string, isFeatured: boolean) {
    await fetch('/api/clinic/storefront/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variantId, isFeatured }),
    })
    fetchProducts()
  }

  async function addProduct(variantId: string) {
    setSaving(true)
    try {
      await fetch('/api/clinic/storefront/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variantId, isEnabled: true }),
      })
      fetchProducts()
    } finally {
      setSaving(false)
    }
  }

  const filteredAvailable = available.filter(
    (v) =>
      !addedVariantIds.has(v.id) &&
      (v.productName.toLowerCase().includes(search.toLowerCase()) ||
        v.sku?.toLowerCase().includes(search.toLowerCase()))
  )

  if (loading) {
    return <div className="max-w-4xl mx-auto p-6"><div className="h-64 bg-white/5 rounded animate-pulse" /></div>
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/shop/storefront-manage">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Product Curation</h1>
          <p className="text-sm text-white/60">Choose which products appear on your storefront</p>
        </div>
      </div>

      {/* Current Products */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Your Storefront Products ({sfProducts.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sfProducts.length === 0 ? (
            <p className="text-sm text-white/50 py-4 text-center">
              No products added yet. Add products from the catalog below.
            </p>
          ) : (
            <div className="space-y-2">
              {sfProducts.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-white/10 hover:bg-white/5 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {p.displayName || p.productName}
                    </p>
                    <p className="text-xs text-white/60">
                      {p.sku} {p.dose && `/ ${p.dose}`}
                    </p>
                  </div>
                  {p.retailPrice !== null && (
                    <Badge variant="outline" className="text-xs">
                      ${p.retailPrice.toFixed(2)}
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => toggleFeatured(p.variantId, !p.isFeatured)}
                    title={p.isFeatured ? 'Unfeature' : 'Feature'}
                  >
                    {p.isFeatured ? (
                      <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                    ) : (
                      <StarOff className="h-4 w-4 text-white/30" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => toggleProduct(p.variantId, !p.isEnabled)}
                    title={p.isEnabled ? 'Disable' : 'Enable'}
                  >
                    {p.isEnabled ? (
                      <Eye className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <EyeOff className="h-4 w-4 text-white/30" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Available Products */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Available Products</CardTitle>
            <Input
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
            />
          </div>
        </CardHeader>
        <CardContent>
          {filteredAvailable.length === 0 ? (
            <p className="text-sm text-white/50 py-4 text-center">
              {search ? 'No matching products found' : 'All available products are already added'}
            </p>
          ) : (
            <div className="space-y-2">
              {filteredAvailable.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-white/10 hover:bg-white/5 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{v.productName}</p>
                    <p className="text-xs text-white/60">
                      {v.sku} {v.dose && `/ ${v.dose}`} &mdash; SRP ${v.srp.toFixed(2)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => addProduct(v.id)}
                    disabled={saving}
                  >
                    Add
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
