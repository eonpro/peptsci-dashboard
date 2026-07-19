'use client'

/**
 * Inventory workspace
 * ===================
 * Orchestrates the four views (Batches / By Product / Low Stock / Activity),
 * the global search, clickable KPI cards, CSV export, and the two detail
 * sheets (batch + product). Data is seeded server-side (page.tsx) and
 * refreshed after every mutation.
 */

import { useState, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { KPI } from '@/components/KPI'
import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  Download,
  Package,
  PackageX,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import {
  type AdjustmentRow,
  type BatchRow,
  type CatalogStockRow,
  type ProductRollupRow,
  REASON_LABELS,
  budTone,
  daysUntil,
  downloadCsv,
  fmtDate,
  isLowStock,
  matchesSearch,
} from './inventory-shared'
import { BatchesTable, ProductsTable, ActivityTable } from './InventoryViews'
import BatchDetailSheet from './BatchDetailSheet'
import ProductDetailSheet from './ProductDetailSheet'

export type { BatchRow, CatalogStockRow } from './inventory-shared'

// Loaded on demand when the rep opens "Receive inventory" — keeps the modal's
// product picker + form out of the inventory page's initial bundle.
const ReceiveInventoryModal = dynamic(() => import('./ReceiveInventoryModal'), { ssr: false })

type View = 'batches' | 'products' | 'low' | 'log'
type BatchFilter = 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'DEPLETED' | 'VOIDED' | 'ALL'

const BATCH_FILTERS: Array<{ key: BatchFilter; label: string }> = [
  { key: 'ACTIVE', label: 'Active' },
  { key: 'EXPIRING', label: 'Expiring ≤90d' },
  { key: 'EXPIRED', label: 'Expired' },
  { key: 'DEPLETED', label: 'Depleted' },
  { key: 'VOIDED', label: 'Voided' },
  { key: 'ALL', label: 'All' },
]

function applyBatchFilter(rows: BatchRow[], filter: BatchFilter): BatchRow[] {
  switch (filter) {
    case 'ACTIVE':
      return rows.filter((b) => b.status === 'RECEIVED')
    case 'EXPIRING':
      return rows.filter(
        (b) => b.status === 'RECEIVED' && budTone(b.bud) === 'soon' && b.qtyOnHand > 0
      )
    case 'EXPIRED':
      return rows.filter(
        (b) => budTone(b.bud) === 'expired' && b.qtyOnHand > 0 && b.status !== 'VOIDED'
      )
    case 'DEPLETED':
      return rows.filter((b) => b.status === 'DEPLETED')
    case 'VOIDED':
      return rows.filter((b) => b.status === 'VOIDED')
    default:
      return rows
  }
}

export default function InventoryClient({
  initialBatches,
  initialCatalog,
}: {
  initialBatches: BatchRow[]
  initialCatalog: CatalogStockRow[]
}) {
  // Seeded from the server render — no first-paint skeleton / client round trip.
  const [batches, setBatches] = useState<BatchRow[]>(initialBatches)
  const [catalog, setCatalog] = useState<CatalogStockRow[]>(initialCatalog)
  const [log, setLog] = useState<AdjustmentRow[] | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [view, setView] = useState<View>('batches')
  const [batchFilter, setBatchFilter] = useState<BatchFilter>('ACTIVE')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [openBatchId, setOpenBatchId] = useState<string | null>(null)
  const [openProduct, setOpenProduct] = useState<ProductRollupRow | null>(null)

  const loadLog = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/inventory/adjustments?t=${Date.now()}`, {
        cache: 'no-store',
      })
      if (!res.ok) throw new Error('Failed to load activity log')
      const data = await res.json()
      setLog(data.adjustments ?? [])
    } catch {
      setLog([])
      toast.error('Failed to load the activity log')
    }
  }, [])

  const loadData = useCallback(
    async (force = false) => {
      try {
        const bust = force ? `&t=${Date.now()}` : ''
        const opts = force ? ({ cache: 'no-store' } as const) : undefined
        const [batchRes, productRes] = await Promise.all([
          fetch(`/api/admin/inventory/batches?status=ALL${bust}`, opts),
          fetch(`/api/admin/products?${bust}`, opts),
        ])
        if (batchRes.ok) {
          const data = await batchRes.json()
          setBatches(data.batches ?? [])
        }
        if (productRes.ok) {
          const data = await productRes.json()
          const variants = (data.variants ?? []) as Array<{
            id: string
            sku: string | null
            productName: string
            dose: string | null
            inventoryOnHand: number
            inventoryReserved?: number
            reorderLevel: number
          }>
          setCatalog(
            variants.map((v) => ({
              variantId: v.id,
              sku: v.sku,
              productName: v.productName,
              dose: v.dose,
              onHand: v.inventoryOnHand,
              reserved: v.inventoryReserved ?? 0,
              reorderLevel: v.reorderLevel,
            }))
          )
        }
        if (log !== null) await loadLog()
      } catch {
        toast.error('Failed to refresh inventory — try again')
      } finally {
        setRefreshing(false)
      }
    },
    [log, loadLog]
  )

  const refresh = useCallback(() => {
    void loadData(true)
  }, [loadData])

  async function handleRefresh() {
    setRefreshing(true)
    await loadData(true)
  }

  function switchView(next: View) {
    setView(next)
    if (next === 'log' && log === null) void loadLog()
  }

  const active = useMemo(() => batches.filter((b) => b.status !== 'VOIDED'), [batches])

  // Every catalog product appears here — 0 on hand until stock is received —
  // with batch aggregates merged in where they exist.
  const productRollup = useMemo<ProductRollupRow[]>(() => {
    const batchAgg = new Map<string, { batches: number; soonestBud: string | null }>()
    for (const b of active) {
      const key = b.variant?.sku ? `sku:${b.variant.sku}` : `nd:${b.productName}|${b.dose}`
      const cur = batchAgg.get(key) ?? { batches: 0, soonestBud: null }
      cur.batches += 1
      if (b.qtyOnHand > 0 && (!cur.soonestBud || new Date(b.bud) < new Date(cur.soonestBud))) {
        cur.soonestBud = b.bud
      }
      batchAgg.set(key, cur)
    }
    return catalog.map((v) => {
      const agg = (v.sku ? batchAgg.get(`sku:${v.sku}`) : undefined) ??
        batchAgg.get(`nd:${v.productName}|${v.dose ?? ''}`) ?? { batches: 0, soonestBud: null }
      return {
        variantId: v.variantId,
        productName: v.productName,
        dose: v.dose ?? '—',
        sku: v.sku,
        onHand: v.onHand,
        reserved: v.reserved,
        available: Math.max(0, v.onHand - v.reserved),
        reorderLevel: v.reorderLevel,
        batches: agg.batches,
        soonestBud: agg.soonestBud,
      }
    })
  }, [active, catalog])

  const lowStockRows = useMemo(() => productRollup.filter(isLowStock), [productRollup])

  const metrics = useMemo(() => {
    const totalOnHand = catalog.reduce((s, v) => s + v.onHand, 0)
    const totalReserved = catalog.reduce((s, v) => s + v.reserved, 0)
    const received = active.filter((b) => b.status === 'RECEIVED')
    const expiringSoon = received.filter((b) => {
      const d = daysUntil(b.bud)
      return d >= 0 && d <= 90 && b.qtyOnHand > 0
    })
    const expired = active.filter((b) => daysUntil(b.bud) < 0 && b.qtyOnHand > 0)
    return {
      totalOnHand,
      available: Math.max(0, totalOnHand - totalReserved),
      batches: received.length,
      lowStock: lowStockRows.length,
      expiringSoon: expiringSoon.length,
      expired: expired.length,
    }
  }, [active, catalog, lowStockRows])

  // ── Filtered rows for the current view ──────────────────────────────────
  const visibleBatches = useMemo(
    () =>
      applyBatchFilter(batches, batchFilter).filter((b) =>
        matchesSearch([b.batchNumber, b.productName, b.dose, b.variant?.sku], search)
      ),
    [batches, batchFilter, search]
  )

  const visibleProducts = useMemo(
    () => productRollup.filter((p) => matchesSearch([p.productName, p.dose, p.sku], search)),
    [productRollup, search]
  )

  const visibleLow = useMemo(
    () => lowStockRows.filter((p) => matchesSearch([p.productName, p.dose, p.sku], search)),
    [lowStockRows, search]
  )

  const visibleLog = useMemo(
    () =>
      (log ?? []).filter((a) =>
        matchesSearch([a.productName, a.dose, a.sku, a.note, a.by, REASON_LABELS[a.reason]], search)
      ),
    [log, search]
  )

  function exportCsv() {
    const stamp = new Date().toISOString().slice(0, 10)
    if (view === 'batches') {
      downloadCsv(
        `inventory-batches-${stamp}.csv`,
        [
          'Batch #',
          'Product',
          'Dose',
          'SKU',
          'BUD',
          'Received',
          'Qty Received',
          'Damaged',
          'On Hand',
          'Status',
        ],
        visibleBatches.map((b) => [
          b.batchNumber,
          b.productName,
          b.dose,
          b.variant?.sku ?? '',
          fmtDate(b.bud),
          fmtDate(b.receivedOn),
          b.qtyReceived,
          b.qtyDamaged,
          b.qtyOnHand,
          b.status,
        ])
      )
    } else if (view === 'log') {
      downloadCsv(
        `inventory-activity-${stamp}.csv`,
        ['When', 'Product', 'Dose', 'SKU', 'Change', 'Reason', 'Note', 'By'],
        visibleLog.map((a) => [
          new Date(a.createdAt).toLocaleString('en-US'),
          a.productName,
          a.dose ?? '',
          a.sku ?? '',
          a.delta,
          REASON_LABELS[a.reason] ?? a.reason,
          a.note ?? '',
          a.by,
        ])
      )
    } else {
      const rows = view === 'low' ? visibleLow : visibleProducts
      downloadCsv(
        `inventory-products-${stamp}.csv`,
        [
          'Product',
          'Dose',
          'SKU',
          'On Hand',
          'Reserved',
          'Available',
          'Reorder At',
          'Batches',
          'Soonest BUD',
        ],
        rows.map((p) => [
          p.productName,
          p.dose,
          p.sku ?? '',
          p.onHand,
          p.reserved,
          p.available,
          p.reorderLevel,
          p.batches,
          p.soonestBud ? fmtDate(p.soonestBud) : '',
        ])
      )
    }
    toast.success('CSV downloaded')
  }

  // Keep the product sheet in sync after a mutation (adjust / reorder change).
  const openProductSynced = useMemo(() => {
    if (!openProduct) return null
    return productRollup.find((p) => p.variantId === openProduct.variantId) ?? openProduct
  }, [openProduct, productRollup])

  return (
    <div className="container mx-auto space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">Inventory</h2>
          <p className="text-muted-foreground mt-1 text-sm md:mt-2 md:text-base">
            Batch-tracked stock — receipts, BUD, labels, reservations, and the full audit trail.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleRefresh} variant="outline" size="sm" disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 md:mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden md:inline">{refreshing ? 'Refreshing…' : 'Refresh'}</span>
          </Button>
          <Button onClick={exportCsv} variant="outline" size="sm">
            <Download className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">Export CSV</span>
          </Button>
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Receive
          </Button>
        </div>
      </div>

      {/* KPI cards — clickable, they jump to the relevant filtered view */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <button className="w-full text-left" onClick={() => switchView('products')}>
          <KPI
            title="Vials On Hand"
            value={metrics.totalOnHand.toLocaleString()}
            description="Across all products"
            icon={<Boxes />}
          />
        </button>
        <button className="w-full text-left" onClick={() => switchView('products')}>
          <KPI
            title="Available"
            value={metrics.available.toLocaleString()}
            description="On hand minus reserved"
            icon={<Package />}
          />
        </button>
        <button
          className="w-full text-left"
          onClick={() => {
            switchView('batches')
            setBatchFilter('ACTIVE')
          }}
        >
          <KPI
            title="Active Batches"
            value={metrics.batches.toLocaleString()}
            description="With stock or receiving"
            icon={<Boxes />}
          />
        </button>
        <button className="w-full text-left" onClick={() => switchView('low')}>
          <KPI
            title="Low Stock"
            value={metrics.lowStock.toLocaleString()}
            description="At or below reorder level"
            icon={<PackageX />}
          />
        </button>
        <button
          className="w-full text-left"
          onClick={() => {
            switchView('batches')
            setBatchFilter('EXPIRING')
          }}
        >
          <KPI
            title="Expiring ≤ 90d"
            value={metrics.expiringSoon.toLocaleString()}
            description="Batches nearing BUD"
            icon={<CalendarClock />}
          />
        </button>
        <button
          className="w-full text-left"
          onClick={() => {
            switchView('batches')
            setBatchFilter('EXPIRED')
          }}
        >
          <KPI
            title="Expired"
            value={metrics.expired.toLocaleString()}
            description="Past BUD with stock"
            icon={<AlertTriangle />}
          />
        </button>
      </div>

      {/* View tabs + search */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs value={view} onValueChange={(v) => switchView(v as View)}>
          <TabsList>
            <TabsTrigger value="batches">Batches</TabsTrigger>
            <TabsTrigger value="products">By Product</TabsTrigger>
            <TabsTrigger value="low">
              Low Stock
              {metrics.lowStock > 0 && (
                <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {metrics.lowStock}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="log">Activity</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative md:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search product, SKU, batch #…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Batch status filter chips */}
      {view === 'batches' && (
        <div className="-mt-2 flex flex-wrap gap-1.5">
          {BATCH_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setBatchFilter(key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                batchFilter === key
                  ? 'bg-foreground text-background'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Active view */}
      {view === 'batches' && <BatchesTable rows={visibleBatches} onOpen={setOpenBatchId} />}
      {view === 'products' && <ProductsTable rows={visibleProducts} onOpen={setOpenProduct} />}
      {view === 'low' && <ProductsTable rows={visibleLow} onOpen={setOpenProduct} />}
      {view === 'log' && <ActivityTable rows={visibleLog} loading={log === null} />}

      {/* Detail sheets */}
      <BatchDetailSheet
        batchId={openBatchId}
        onOpenChange={(open) => !open && setOpenBatchId(null)}
        onChanged={refresh}
      />
      <ProductDetailSheet
        row={openProductSynced}
        onOpenChange={(open) => !open && setOpenProduct(null)}
        onChanged={refresh}
        onOpenBatch={(id) => setOpenBatchId(id)}
      />

      <ReceiveInventoryModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onReceived={() => loadData(true)}
      />
    </div>
  )
}
