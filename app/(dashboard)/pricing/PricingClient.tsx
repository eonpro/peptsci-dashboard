'use client'

import { useMemo, useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PriceSheet } from '@/lib/pricing'
import type { ShopProduct } from '@/lib/types/shop'
import ExportButton from './ExportButton'
import PricingTable from './PricingTable'
import EditPriceDialog from './EditPriceDialog'
import { ProductCard } from '@/components/shop/ProductCard'
import { LayoutGrid, List, RefreshCw, Users } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { apiError } from '@/lib/api-error'

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
    Id: p.id ?? p.Id ?? undefined,
  }))
}

/** Keep grouped catalog cards in sync with refreshed Cost/SRP rows. */
function applyPricesToProducts(products: ShopProduct[], prices: PriceSheet[]): ShopProduct[] {
  const bySku = new Map(prices.map((p) => [p.SKU, p]))
  return products.map((product) => {
    const own = bySku.get(product.sku)
    const sizeOptions = product.sizeOptions?.map((s) => {
      const row = bySku.get(s.sku)
      if (!row) return s
      return {
        ...s,
        displayPrice: row.SRP,
        inStock: row.Notes === 'In Stock',
      }
    })
    return {
      ...product,
      displayPrice: own?.SRP ?? product.displayPrice,
      inStock: own ? own.Notes === 'In Stock' : product.inStock,
      ...(sizeOptions ? { sizeOptions } : {}),
    }
  })
}

export default function PricingClient({
  initialPrices,
  initialProducts,
}: {
  initialPrices: PriceSheet[]
  initialProducts: ShopProduct[]
}) {
  // Seeded from the server render, so there's no first-paint skeleton or
  // client round trip. Background refresh keeps it live.
  const [prices, setPrices] = useState<PriceSheet[]>(initialPrices)
  const [catalogProducts] = useState<ShopProduct[]>(initialProducts)
  const [view, setView] = useState<'card' | 'list'>('card')
  const [refreshing, setRefreshing] = useState(false)
  const [editingRow, setEditingRow] = useState<PriceSheet | null>(null)

  const products = useMemo(
    () => applyPricesToProducts(catalogProducts, prices),
    [catalogProducts, prices]
  )

  const pricesBySku = useMemo(() => {
    const map = new Map<string, PriceSheet>()
    for (const p of prices) map.set(p.SKU, p)
    return map
  }, [prices])

  // `force` bypasses the browser cache for an explicit manual refresh; the
  // background poll reuses the cache.
  /** Returns null on success, or the (server-provided) error message. */
  async function fetchPrices(force = false): Promise<string | null> {
    try {
      const response = await fetch(force ? `/api/prices?t=${Date.now()}` : '/api/prices', {
        cache: force ? 'no-store' : 'default',
      })
      if (!response.ok) throw await apiError(response, 'Failed to fetch prices')
      setPrices(normalizePrices(await response.json()))
      return null
    } catch (error) {
      console.error('Error fetching prices:', error)
      return error instanceof Error ? error.message : 'Failed to fetch prices'
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
    const err = await fetchPrices(true)
    if (!err) toast.success('Pricing refreshed')
    else toast.error(err)
  }

  const openEditForSku = (sku: string) => {
    const row = pricesBySku.get(sku)
    if (row) {
      setEditingRow(row)
      return
    }
    // Fallback: match by dose on any size option of a product that owns this sku
    toast.error('No pricing row found for that SKU')
  }

  const pricedForMargin = prices.filter((p) => p.SRP > 0)
  const avgMargin =
    pricedForMargin.length > 0
      ? pricedForMargin.reduce((acc, p) => acc + ((p.SRP - p.Cost) / p.SRP) * 100, 0) /
        pricedForMargin.length
      : 0

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
          {/* Same scientific product cards as the client portal catalog */}
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => {
              const sizeSkus =
                product.sizeOptions && product.sizeOptions.length > 0
                  ? product.sizeOptions.map((s) => s.sku)
                  : [product.sku || product.id]
              const skus = sizeSkus
                .map((sku) => {
                  const row = pricesBySku.get(sku)
                  if (!row) return null
                  return {
                    sku,
                    cost: row.Cost,
                    srp: row.SRP,
                    id: row.Id,
                  }
                })
                .filter((r): r is NonNullable<typeof r> => r != null)

              return (
                <ProductCard
                  key={product.parentProductId || product.id}
                  product={product}
                  viewMode="grid"
                  adminPricing={{
                    skus,
                    onEdit: openEditForSku,
                  }}
                />
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
                <div className="text-2xl font-bold">{products.length}</div>
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
                  {prices.length > 0 ? avgMargin.toFixed(1) : '0.0'}%
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
            <CardDescription>
              Complete pricing list with margins and availability. Use the pencil to edit a
              product&apos;s cost and SRP.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <PricingTable data={prices} onEdit={setEditingRow} />
          </CardContent>
        </Card>
      )}

      <EditPriceDialog
        row={editingRow}
        onOpenChange={(open) => {
          if (!open) setEditingRow(null)
        }}
        onSaved={async () => {
          await fetchPrices(true)
        }}
      />
    </div>
  )
}
