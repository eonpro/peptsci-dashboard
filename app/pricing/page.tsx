'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PriceSheet } from '@/lib/sheets'
import ExportButton from './ExportButton'
import PricingTable from './PricingTable'
import { LayoutGrid, List, RefreshCw } from 'lucide-react'

export default function PricingPage() {
  const [prices, setPrices] = useState<PriceSheet[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'card' | 'list'>('card')
  const [refreshing, setRefreshing] = useState(false)

  // Fetch prices function
  async function fetchPrices() {
    try {
      // Force cache bypass with timestamp
      const response = await fetch(`/api/prices?t=${Date.now()}`, {
        cache: 'no-store'
      })
      if (!response.ok) {
        throw new Error('Failed to fetch prices')
      }
      const data = await response.json()
      setPrices(data)
    } catch (error) {
      console.error('Error fetching prices:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // Fetch data on mount
  useEffect(() => {
    fetchPrices()
  }, [])

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchPrices()
    }, 60000) // Refresh every minute
    
    return () => clearInterval(interval)
  }, [])

  // Manual refresh function
  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchPrices()
  }

  if (loading) {
    return (
      <div className="container mx-auto space-y-6 p-6">
        <div className="animate-pulse">
          <div className="h-8 w-48 bg-gray-200 rounded mb-4"></div>
          <div className="h-4 w-64 bg-gray-200 rounded mb-6"></div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-48 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Group prices by product for display
  const groupedPrices = prices.reduce((acc, price) => {
    const product = price.Product
    if (!acc[product]) {
      acc[product] = []
    }
    acc[product].push(price)
    return acc
  }, {} as Record<string, PriceSheet[]>)

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Pricing</h2>
          <p className="text-muted-foreground">
            Product pricing and margin information
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleRefresh}
            variant="outline"
            size="sm"
            disabled={refreshing}
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
              const minPrice = Math.min(...variations.map(v => v.SRP))
              const maxPrice = Math.max(...variations.map(v => v.SRP))
              const avgMargin = variations.reduce((acc, v) => {
                const margin = ((v.SRP - v.Cost) / v.SRP) * 100
                return acc + margin
              }, 0) / variations.length
              
              return (
                <Card key={`${product}-${index}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{product}</CardTitle>
                      {variations.some(v => v.Notes === 'In Stock') && (
                        <Badge className="bg-green-100 text-green-800">In Stock</Badge>
                      )}
                    </div>
                    <CardDescription>
                      {variations.length} variations available
                    </CardDescription>
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
                        <span className={`font-medium ${
                          avgMargin >= 70 ? 'text-green-600' : 
                          avgMargin >= 50 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {avgMargin.toFixed(1)}%
                        </span>
                      </div>
                      <div className="pt-2">
                        <div className="text-xs text-muted-foreground mb-1">Doses:</div>
                        <div className="flex flex-wrap gap-1">
                          {variations.map((v, idx) => (
                            <Badge key={`${product}_${v.Dose}_${idx}`} variant="secondary" className="text-xs">
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
                  {prices.filter(p => p.Notes === 'In Stock').length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Avg Margin</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(
                    prices.reduce((acc, p) => {
                      const margin = ((p.SRP - p.Cost) / p.SRP) * 100
                      return acc + margin
                    }, 0) / prices.length
                  ).toFixed(1)}%
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