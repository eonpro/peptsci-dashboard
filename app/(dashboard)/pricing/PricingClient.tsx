'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PriceSheet } from '@/lib/pricing'
import ExportButton from './ExportButton'
import PricingTable from './PricingTable'
import { LayoutGrid, List, RefreshCw, Users } from 'lucide-react'
import Link from 'next/link'

/** Normalize the /api/prices payload (ProductPrice shape) to PriceSheet. */
function normalizePrices(data: unknown): PriceSheet[] {
  const list: unknown = Array.isArray(data) ? data : (data as { prices?: unknown })?.prices
  return (Array.isArray(list) ? list : []).map((p: any) => ({
    SKU: p.sku ?? p.SKU ?? '',
    Product: p.productName ?? p.Product ?? '',
    Dose: p.dose ?? p.Dose ?? '',
    Cost: Number(p.unitCost ?? p.Cost ?? 0),
    SRP: Number(p.srp ?? p.SRP ?? 0),
    Notes:
      p.Notes ?? (typeof p.inventoryOnHand === 'number' && p.inventoryOnHand > 0 ? 'In Stock' : ''),
  }))
}

export default function PricingClient({ initialPrices }: { initialPrices: PriceSheet[] }) {
  // Seeded from the server render, so there's no first-paint skeleton or
  // client round trip. Background refresh keeps it live.
  const [prices, setPrices] = useState<PriceSheet[]>(initialPrices)
  const [view, setView] = useState<'card' | 'list'>('card')
  const [refreshing, setRefreshing] = useState(false)

  // `force` bypasses the browser cache for an explicit manual refresh; the
  // background poll reuses the cache.
  async function fetchPrices(force = false) {
    try {
      const response = await fetch(force ? `/api/prices?t=${Date.now()}` : '/api/prices', {
        cache: force ? 'no-store' : 'default',
      })
      if (!response.ok) throw new Error('Failed to fetch prices')
      setPrices(normalizePrices(await response.json()))
    } catch (error) {
      console.error('Error fetching prices:', error)
    } finally {
      setRefreshing(false)
    }
  }

  // Auto-refresh periodically, only while the tab is visible.
  useEffect(() => {
    const REFRESH_MS = 5 * 60 * 1000
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchPrices()
    }, REFRESH_MS)
    return () => clearInterval(interval)
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchPrices(true)
  }

  // Group prices by product for display
  const groupedPrices = prices.reduce(
    (acc, price) => {
      const product = price.Product
      if (!acc[product]) acc[product] = []
      acc[product].push(price)
      return acc
    },
    {} as Record<string, PriceSheet[]>
  )

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Pricing</h2>
          <p className="text-white/60">Product pricing and margin information</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/pricing/client-pricing">
            <Button
              variant="outline"
              size="sm"
              className="bg-[#0a0e3a] border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
            >
              <Users className="h-4 w-4 mr-2" />
              Client Pricing
            </Button>
          </Link>
          <Button
            onClick={handleRefresh}
            variant="outline"
            size="sm"
            disabled={refreshing}
            className="bg-[#0a0e3a] border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Button
            variant={view === 'card' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setView('card')}
          >
            <LayoutGrid className="h-4 w-4 mr-2" />
            Card View
          </Button>
          <Button
            variant={view === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setView('list')}
          >
            <List className="h-4 w-4 mr-2" />
            List View
          </Button>
          <ExportButton data={prices} />
        </div>
      </div>

      {view === 'card' ? (
        <>
          {/* Pricing Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Object.entries(groupedPrices).map(([product, variations], index) => {
              const minPrice = Math.min(...variations.map((v) => v.SRP))
              const maxPrice = Math.max(...variations.map((v) => v.SRP))
              const avgMargin =
                variations.reduce((acc, v) => {
                  const margin = ((v.SRP - v.Cost) / v.SRP) * 100
                  return acc + margin
                }, 0) / variations.length

              return (
                <Card key={`${product}-${index}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{product}</CardTitle>
                      {variations.some((v) => v.Notes === 'In Stock') && (
                        <Badge className="bg-green-100 text-green-800">In Stock</Badge>
                      )}
                    </div>
                    <CardDescription>{variations.length} variations available</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Price Range:</span>
                        <span className="font-medium">
                          ${minPrice} - ${maxPrice}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Avg Margin:</span>
                        <span
                          className={`font-medium ${
                            avgMargin >= 70
                              ? 'text-green-600'
                              : avgMargin >= 50
                                ? 'text-yellow-600'
                                : 'text-red-600'
                          }`}
                        >
                          {avgMargin.toFixed(1)}%
                        </span>
                      </div>
                      <div className="pt-2">
                        <div className="text-xs text-muted-foreground mb-1">Doses:</div>
                        <div className="flex flex-wrap gap-1">
                          {variations.map((v, idx) => (
                            <Badge
                              key={`${product}_${v.Dose}_${idx}`}
                              variant="secondary"
                              className="text-xs"
                            >
                              {v.Dose}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Summary Stats */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Products</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{Object.keys(groupedPrices).length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total SKUs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{prices.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">In Stock</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {prices.filter((p) => p.Notes === 'In Stock').length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Avg Margin</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {prices.length > 0
                    ? (
                        prices.reduce((acc, p) => {
                          const margin = ((p.SRP - p.Cost) / p.SRP) * 100
                          return acc + margin
                        }, 0) / prices.length
                      ).toFixed(1)
                    : '0.0'}
                  %
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        /* List View - Pricing Table */
        <Card>
          <CardHeader>
            <CardTitle>All Products</CardTitle>
            <CardDescription>Complete pricing list with margins and availability</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <PricingTable data={prices} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
