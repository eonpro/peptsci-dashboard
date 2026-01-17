'use client'

import { useState, useEffect } from 'react'
import { getInventoryMetrics } from '@/lib/kpis'
import { KPI } from '@/components/KPI'
import { Package, DollarSign, AlertTriangle, LayoutGrid, List, RefreshCw } from 'lucide-react'
import InventoryCards from './InventoryCards'
import InventoryList from './InventoryList'
import { Button } from '@/components/ui/button'
import { Inventory } from '@/lib/sheets'

export default function InventoryPage() {
  const [view, setView] = useState<'card' | 'list'>('card')
  const [inventory, setInventory] = useState<Inventory[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  
  // Fetch inventory function
  async function loadData() {
    try {
      // Force cache bypass with timestamp
      const response = await fetch(`/api/inventory?t=${Date.now()}`, {
        cache: 'no-store'
      })
      if (!response.ok) {
        throw new Error('Failed to fetch inventory')
      }
      const data = await response.json()
      setInventory(data)
    } catch (error) {
      console.error('Error fetching inventory:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }
  
  // Fetch inventory data on component mount
  useEffect(() => {
    loadData()
  }, [])
  
  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadData()
    }, 60000) // Refresh every minute
    
    return () => clearInterval(interval)
  }, [])
  
  // Manual refresh function
  const handleRefresh = async () => {
    setRefreshing(true)
    await loadData()
  }

  if (loading) {
    return (
      <div className="container mx-auto space-y-6 p-6">
        <div className="animate-pulse">
          <div className="h-8 w-48 bg-gray-200 rounded mb-4"></div>
          <div className="h-4 w-64 bg-gray-200 rounded mb-6"></div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const metrics = getInventoryMetrics(inventory)
  const totalUnitsOrdered = inventory.reduce((sum, item) => sum + item.InventoryOrdered, 0)
  const totalUnitsAvailable = inventory.reduce((sum, item) => sum + item.InventoryAvailable, 0)

  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* Page Header with View Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Inventory</h2>
          <p className="text-muted-foreground mt-2">
            Manage medication inventory and stock levels
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
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPI
          title="Total Opportunity Value"
          value={`$${metrics.totalValue.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })}`}
          description="Total potential revenue from inventory"
          icon={<DollarSign />}
        />
        <KPI
          title="Available Units"
          value={totalUnitsAvailable.toLocaleString()}
          description={`of ${totalUnitsOrdered.toLocaleString()} ordered`}
          icon={<Package />}
        />
        <KPI
          title="Total SKUs"
          value={metrics.totalItems.toLocaleString()}
          description="Unique products"
          icon={<Package />}
        />
        <KPI
          title="Low Stock Items"
          value={metrics.lowStockItems.length.toLocaleString()}
          description="Items ≤ 10 units"
          icon={<AlertTriangle />}
        />
      </div>

      {/* Inventory Display */}
      {view === 'card' ? (
        <InventoryCards inventory={inventory} />
      ) : (
        <InventoryList data={inventory} />
      )}
    </div>
  )
}