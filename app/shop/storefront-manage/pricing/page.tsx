'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Save, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { StorefrontProductItem } from '@/lib/types/storefront'

interface PriceEdit {
  storefrontProductId: string
  retailPrice: string
  compareAtPrice: string
}

export default function PricingPage() {
  const [products, setProducts] = useState<StorefrontProductItem[]>([])
  const [prices, setPrices] = useState<Record<string, PriceEdit>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/clinic/storefront/products?enabledOnly=true')
      if (!res.ok) return
      const data: StorefrontProductItem[] = await res.json()
      setProducts(data)
      const priceMap: Record<string, PriceEdit> = {}
      data.forEach((p) => {
        priceMap[p.id] = {
          storefrontProductId: p.id,
          retailPrice: p.retailPrice?.toString() ?? '',
          compareAtPrice: p.compareAtPrice?.toString() ?? '',
        }
      })
      setPrices(priceMap)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  function updatePrice(id: string, field: 'retailPrice' | 'compareAtPrice', value: string) {
    setPrices((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }))
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      const payload = Object.values(prices)
        .filter((p) => p.retailPrice)
        .map((p) => ({
          storefrontProductId: p.storefrontProductId,
          retailPrice: parseFloat(p.retailPrice),
          compareAtPrice: p.compareAtPrice ? parseFloat(p.compareAtPrice) : null,
        }))

      const res = await fetch('/api/clinic/storefront/pricing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prices: payload }),
      })

      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="max-w-4xl mx-auto p-6"><div className="h-64 bg-white/5 rounded animate-pulse" /></div>
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/shop/storefront-manage">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">Retail Pricing</h1>
          <p className="text-sm text-white/60">Set the prices your customers will see</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save All'}
        </Button>
      </div>

      {products.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <DollarSign className="h-10 w-10 text-white/30 mx-auto mb-3" />
            <p className="text-white/60">
              No products to price. <Link href="/shop/storefront-manage/products" className="text-blue-300 underline">Add products first</Link>.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Product Prices ({products.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Header */}
              <div className="grid grid-cols-12 gap-3 text-xs font-medium text-white/60 px-2">
                <div className="col-span-5">Product</div>
                <div className="col-span-2">SKU</div>
                <div className="col-span-2">Retail Price</div>
                <div className="col-span-3">Compare At (strikethrough)</div>
              </div>
              {products.map((p) => {
                const pe = prices[p.id]
                if (!pe) return null
                return (
                  <div key={p.id} className="grid grid-cols-12 gap-3 items-center p-2 rounded-lg hover:bg-white/5">
                    <div className="col-span-5">
                      <p className="text-sm font-medium truncate">{p.displayName || p.productName}</p>
                      <p className="text-xs text-white/50">{p.dose}</p>
                    </div>
                    <div className="col-span-2 text-xs text-white/60">{p.sku}</div>
                    <div className="col-span-2">
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-white/40 text-sm">$</span>
                        <Input
                          value={pe.retailPrice}
                          onChange={(e) => updatePrice(p.id, 'retailPrice', e.target.value)}
                          className="pl-6 h-8 text-sm"
                          type="number"
                          step="0.01"
                          min="0"
                        />
                      </div>
                    </div>
                    <div className="col-span-3">
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-white/40 text-sm">$</span>
                        <Input
                          value={pe.compareAtPrice}
                          onChange={(e) => updatePrice(p.id, 'compareAtPrice', e.target.value)}
                          className="pl-6 h-8 text-sm"
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Optional"
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
