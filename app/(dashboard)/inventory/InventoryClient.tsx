'use client'

/**
 * Inventory workspace
 * ===================
 * Orchestrates five views (Batches / By Product / Low Stock / Reservations /
 * Activity), the global search, clickable KPI cards, the analytics section,
 * CSV export, and the detail sheets (batch + product).
 *
 * Batches, Reservations, and Activity are SERVER-DRIVEN: search / filters /
 * sort / pagination are pushed to the admin APIs so the workspace scales past
 * what fits in client memory. Products / Low Stock work on the full (small)
 * catalog client-side. Tab, filter, search, and page live in the URL so KPI
 * deep-links, refresh, and back/forward all restore the same view.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { KPI } from '@/components/KPI'
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CalendarClock,
  ChevronDown,
  Download,
  Lock,
  LockOpen,
  Package,
  PackageX,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Pagination } from '@/components/Pagination'
import { apiError } from '@/lib/api-error'
import { toast } from 'sonner'
import {
  type AdjustmentRow,
  type BatchRow,
  type BatchScope,
  type BatchSortKey,
  type CatalogStockRow,
  type InventorySummaryPayload,
  type ProductRollupRow,
  type ReservationRow,
  type SortDir,
  REASON_LABELS,
  downloadCsv,
  fmtDate,
  isLowStock,
  matchesSearch,
} from './inventory-shared'
import {
  ActivityTable,
  BatchesTable,
  ProductsTable,
  ReservationsTable,
} from './InventoryViews'
import BatchDetailSheet from './BatchDetailSheet'
import ProductDetailSheet from './ProductDetailSheet'

export type { BatchRow, CatalogStockRow } from './inventory-shared'

// Loaded on demand — keeps the receive form + variant picker and the recharts
// bundle out of the workspace's initial JS.
const ReceiveInventoryModal = dynamic(() => import('./ReceiveInventoryModal'), { ssr: false })
const InventoryCharts = dynamic(() => import('./InventoryCharts'), {
  ssr: false,
  loading: () => <div className="h-[320px] w-full animate-pulse rounded-xl bg-muted/40" />,
})

type View = 'batches' | 'products' | 'low' | 'reservations' | 'log'

const VIEWS: ReadonlySet<string> = new Set(['batches', 'products', 'low', 'reservations', 'log'])

const BATCH_FILTERS: Array<{ key: BatchScope; label: string }> = [
  { key: 'ACTIVE', label: 'Active' },
  { key: 'EXPIRING', label: 'Expiring ≤90d' },
  { key: 'EXPIRED', label: 'Expired' },
  { key: 'DEPLETED', label: 'Depleted' },
  { key: 'VOIDED', label: 'Voided' },
  { key: 'ALL', label: 'All' },
]

const BATCH_SCOPES: ReadonlySet<string> = new Set(BATCH_FILTERS.map((f) => f.key))

const DEFAULT_PAGE_SIZE = 25
const EXPORT_PAGE_SIZE = 500

export interface PagedBatchesPayload {
  batches: BatchRow[]
  total: number
  page: number
  pageSize: number
}

interface PagedLog {
  rows: AdjustmentRow[]
  total: number
}

interface PagedReservations {
  rows: ReservationRow[]
  total: number
  totalUnits: number
}

/** Debounce a rapidly-changing value (search box → server queries). */
function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

export default function InventoryClient({
  initialBatches,
  initialCatalog,
  initialSummary,
  enforcementEnabled,
}: {
  initialBatches: PagedBatchesPayload
  initialCatalog: CatalogStockRow[]
  initialSummary: InventorySummaryPayload
  enforcementEnabled: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // ── URL-seeded state ───────────────────────────────────────────────────
  const [view, setView] = useState<View>(() => {
    const t = searchParams.get('tab') ?? ''
    return VIEWS.has(t) ? (t as View) : 'batches'
  })
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '')
  const [batchFilter, setBatchFilter] = useState<BatchScope>(() => {
    const f = (searchParams.get('filter') ?? '').toUpperCase()
    return BATCH_SCOPES.has(f) ? (f as BatchScope) : 'ACTIVE'
  })
  const [batchPage, setBatchPage] = useState(() => {
    const p = Number(searchParams.get('page'))
    return Number.isInteger(p) && p >= 1 ? p : 1
  })

  const debouncedSearch = useDebounced(search)

  // ── Server-driven data ─────────────────────────────────────────────────
  const [summary, setSummary] = useState<InventorySummaryPayload>(initialSummary)
  const [catalog, setCatalog] = useState<CatalogStockRow[]>(initialCatalog)

  const [batchData, setBatchData] = useState<{ rows: BatchRow[]; total: number }>({
    rows: initialBatches.batches,
    total: initialBatches.total,
  })
  const [batchPageSize, setBatchPageSize] = useState(initialBatches.pageSize)
  const [batchSort, setBatchSort] = useState<{ key: BatchSortKey; dir: SortDir }>({
    key: 'createdAt',
    dir: 'desc',
  })
  const [batchLoading, setBatchLoading] = useState(false)

  const [logData, setLogData] = useState<PagedLog | null>(null)
  const [logPage, setLogPage] = useState(1)
  const [logPageSize, setLogPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [logReason, setLogReason] = useState<string>('ALL')
  const [logFrom, setLogFrom] = useState('')
  const [logTo, setLogTo] = useState('')
  const [logLoading, setLogLoading] = useState(false)

  const [resData, setResData] = useState<PagedReservations | null>(null)
  const [resPage, setResPage] = useState(1)
  const [resPageSize, setResPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [resLoading, setResLoading] = useState(false)

  const [refreshing, setRefreshing] = useState(false)
  const [chartsOpen, setChartsOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [openBatchId, setOpenBatchId] = useState<string | null>(null)
  const [openProduct, setOpenProduct] = useState<ProductRollupRow | null>(null)

  // ── URL sync (replace, no scroll) ──────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams()
    if (view !== 'batches') params.set('tab', view)
    if (view === 'batches' && batchFilter !== 'ACTIVE') params.set('filter', batchFilter)
    if (search) params.set('q', search)
    if (view === 'batches' && batchPage > 1) params.set('page', String(batchPage))
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [view, batchFilter, search, batchPage, pathname, router])

  // ── Fetchers ───────────────────────────────────────────────────────────
  const batchQuery = useMemo(() => {
    const params = new URLSearchParams({
      status: batchFilter,
      page: String(batchPage),
      pageSize: String(batchPageSize),
      sort: batchSort.key,
      dir: batchSort.dir,
    })
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim())
    return params.toString()
  }, [batchFilter, batchPage, batchPageSize, batchSort, debouncedSearch])

  const loadBatches = useCallback(async (query: string) => {
    setBatchLoading(true)
    try {
      const res = await fetch(`/api/admin/inventory/batches?${query}&t=${Date.now()}`, {
        cache: 'no-store',
      })
      if (!res.ok) throw await apiError(res, 'Failed to load batches')
      const data = await res.json()
      setBatchData({ rows: data.batches ?? [], total: data.total ?? 0 })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load batches')
    } finally {
      setBatchLoading(false)
    }
  }, [])

  // Skip the fetch matching the server-seeded first paint; fetch on any change.
  const seededBatchQuery = useRef<string | null>(null)
  if (seededBatchQuery.current === null) {
    seededBatchQuery.current = new URLSearchParams({
      status: 'ACTIVE',
      page: '1',
      pageSize: String(initialBatches.pageSize),
      sort: 'createdAt',
      dir: 'desc',
    }).toString()
  }
  useEffect(() => {
    if (batchQuery === seededBatchQuery.current) return
    seededBatchQuery.current = '' // any later return to the seed state refetches
    void loadBatches(batchQuery)
  }, [batchQuery, loadBatches])

  const logQuery = useMemo(() => {
    const params = new URLSearchParams({ page: String(logPage), pageSize: String(logPageSize) })
    if (logReason !== 'ALL') params.set('reason', logReason)
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim())
    if (logFrom) params.set('from', logFrom)
    if (logTo) params.set('to', logTo)
    return params.toString()
  }, [logPage, logPageSize, logReason, logFrom, logTo, debouncedSearch])

  const loadLog = useCallback(async (query: string) => {
    setLogLoading(true)
    try {
      const res = await fetch(`/api/admin/inventory/adjustments?${query}&t=${Date.now()}`, {
        cache: 'no-store',
      })
      if (!res.ok) throw await apiError(res, 'Failed to load the activity log')
      const data = await res.json()
      setLogData({ rows: data.adjustments ?? [], total: data.total ?? 0 })
    } catch (err) {
      setLogData({ rows: [], total: 0 })
      toast.error(err instanceof Error ? err.message : 'Failed to load the activity log')
    } finally {
      setLogLoading(false)
    }
  }, [])

  useEffect(() => {
    if (view !== 'log') return
    void loadLog(logQuery)
  }, [view, logQuery, loadLog])

  const resQuery = useMemo(() => {
    const params = new URLSearchParams({ page: String(resPage), pageSize: String(resPageSize) })
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim())
    return params.toString()
  }, [resPage, resPageSize, debouncedSearch])

  const loadReservations = useCallback(async (query: string) => {
    setResLoading(true)
    try {
      const res = await fetch(`/api/admin/inventory/reservations?${query}&t=${Date.now()}`, {
        cache: 'no-store',
      })
      if (!res.ok) throw await apiError(res, 'Failed to load reservations')
      const data = await res.json()
      setResData({
        rows: data.reservations ?? [],
        total: data.total ?? 0,
        totalUnits: data.totalUnits ?? 0,
      })
    } catch (err) {
      setResData({ rows: [], total: 0, totalUnits: 0 })
      toast.error(err instanceof Error ? err.message : 'Failed to load reservations')
    } finally {
      setResLoading(false)
    }
  }, [])

  useEffect(() => {
    if (view !== 'reservations') return
    void loadReservations(resQuery)
  }, [view, resQuery, loadReservations])

  const loadSummary = useCallback(async (days?: number) => {
    try {
      const res = await fetch(
        `/api/admin/inventory/summary?days=${days ?? 30}&t=${Date.now()}`,
        { cache: 'no-store' }
      )
      if (!res.ok) throw new Error()
      const data = await res.json()
      if (data.summary) setSummary(data.summary)
    } catch {
      // KPI staleness is non-fatal; the tables carry the workflow.
    }
  }, [])

  const loadCatalog = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/inventory/catalog?t=${Date.now()}`, {
        cache: 'no-store',
      })
      if (!res.ok) throw await apiError(res, 'Failed to refresh the product catalog')
      const data = await res.json()
      setCatalog(data.catalog ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to refresh the product catalog')
    }
  }, [])

  /** Full refresh after any mutation (receive, adjust, void, reorder edit). */
  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const jobs: Array<Promise<unknown>> = [
        loadBatches(batchQuery),
        loadCatalog(),
        loadSummary(summary.windowDays),
      ]
      if (view === 'log') jobs.push(loadLog(logQuery))
      if (view === 'reservations') jobs.push(loadReservations(resQuery))
      await Promise.all(jobs)
    } finally {
      setRefreshing(false)
    }
  }, [
    batchQuery,
    logQuery,
    resQuery,
    view,
    summary.windowDays,
    loadBatches,
    loadCatalog,
    loadSummary,
    loadLog,
    loadReservations,
  ])

  // ── View switching ─────────────────────────────────────────────────────
  const switchView = useCallback((next: View) => {
    setView(next)
  }, [])

  function jumpToBatches(filter: BatchScope) {
    setBatchFilter(filter)
    setBatchPage(1)
    switchView('batches')
  }

  function onBatchSort(key: BatchSortKey) {
    setBatchPage(1)
    setBatchSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))
  }

  // ── Client-side product rollup (catalog is small) ──────────────────────
  const productRollup = useMemo<ProductRollupRow[]>(
    () =>
      catalog.map((v) => ({
        variantId: v.variantId,
        productName: v.productName,
        dose: v.dose ?? '—',
        sku: v.sku,
        onHand: v.onHand,
        reserved: v.reserved,
        available: Math.max(0, v.onHand - v.reserved),
        reorderLevel: v.reorderLevel,
        batches: v.batches,
        soonestBud: v.soonestBud,
      })),
    [catalog]
  )

  const lowStockRows = useMemo(() => productRollup.filter(isLowStock), [productRollup])

  const visibleProducts = useMemo(
    () => productRollup.filter((p) => matchesSearch([p.productName, p.dose, p.sku], search)),
    [productRollup, search]
  )
  const visibleLow = useMemo(
    () => lowStockRows.filter((p) => matchesSearch([p.productName, p.dose, p.sku], search)),
    [lowStockRows, search]
  )

  const kpis = summary.kpis

  // ── CSV export (fetches the FULL filtered set for server-driven views) ──
  async function exportCsv() {
    const stamp = new Date().toISOString().slice(0, 10)
    try {
      if (view === 'batches') {
        const params = new URLSearchParams({
          status: batchFilter,
          page: '1',
          pageSize: String(EXPORT_PAGE_SIZE),
          sort: batchSort.key,
          dir: batchSort.dir,
        })
        if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim())
        const res = await fetch(`/api/admin/inventory/batches?${params}`, { cache: 'no-store' })
        if (!res.ok) throw await apiError(res, 'Failed to export batches')
        const rows: BatchRow[] = (await res.json()).batches ?? []
        downloadCsv(
          `inventory-batches-${stamp}.csv`,
          ['Batch #', 'Product', 'Dose', 'SKU', 'BUD', 'Received', 'Qty Received', 'Damaged', 'On Hand', 'Status'],
          rows.map((b) => [
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
        const params = new URLSearchParams({ page: '1', pageSize: String(EXPORT_PAGE_SIZE) })
        if (logReason !== 'ALL') params.set('reason', logReason)
        if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim())
        if (logFrom) params.set('from', logFrom)
        if (logTo) params.set('to', logTo)
        const res = await fetch(`/api/admin/inventory/adjustments?${params}`, { cache: 'no-store' })
        if (!res.ok) throw await apiError(res, 'Failed to export the activity log')
        const rows: AdjustmentRow[] = (await res.json()).adjustments ?? []
        downloadCsv(
          `inventory-activity-${stamp}.csv`,
          ['When', 'Product', 'Dose', 'SKU', 'Change', 'Reason', 'Note', 'By'],
          rows.map((a) => [
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
      } else if (view === 'reservations') {
        const params = new URLSearchParams({ page: '1', pageSize: String(EXPORT_PAGE_SIZE) })
        if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim())
        const res = await fetch(`/api/admin/inventory/reservations?${params}`, {
          cache: 'no-store',
        })
        if (!res.ok) throw await apiError(res, 'Failed to export reservations')
        const rows: ReservationRow[] = (await res.json()).reservations ?? []
        downloadCsv(
          `inventory-reservations-${stamp}.csv`,
          ['Order #', 'Order Status', 'Customer', 'Product', 'Dose', 'SKU', 'Qty Held', 'Held Since'],
          rows.map((r) => [
            r.orderNumber,
            r.orderStatus,
            r.customer ?? '',
            r.productName,
            r.dose ?? '',
            r.sku ?? '',
            r.quantity,
            new Date(r.createdAt).toLocaleString('en-US'),
          ])
        )
      } else {
        const rows = view === 'low' ? visibleLow : visibleProducts
        downloadCsv(
          `inventory-products-${stamp}.csv`,
          ['Product', 'Dose', 'SKU', 'On Hand', 'Reserved', 'Available', 'Reorder At', 'Batches', 'Soonest BUD'],
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed — try again')
    }
  }

  // Keep the product sheet in sync after a mutation (adjust / reorder change).
  const openProductSynced = useMemo(() => {
    if (!openProduct) return null
    return productRollup.find((p) => p.variantId === openProduct.variantId) ?? openProduct
  }, [openProduct, productRollup])

  const batchTotalPages = Math.max(1, Math.ceil(batchData.total / batchPageSize))
  const logTotalPages = Math.max(1, Math.ceil((logData?.total ?? 0) / logPageSize))
  const resTotalPages = Math.max(1, Math.ceil((resData?.total ?? 0) / resPageSize))

  return (
    <div className="container mx-auto space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl">Inventory</h2>
            {enforcementEnabled ? (
              <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600 dark:bg-emerald-700">
                <Lock className="h-3 w-3" /> Stock enforcement on
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="gap-1 border-amber-400/60 text-amber-600 dark:text-amber-400"
              >
                <LockOpen className="h-3 w-3" /> Oversell allowed
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1 text-sm md:mt-2 md:text-base">
            Batch-tracked stock — receipts, BUD, labels, reservations, and the full audit trail.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setChartsOpen((v) => !v)}
            variant={chartsOpen ? 'secondary' : 'outline'}
            size="sm"
          >
            <BarChart3 className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">Analytics</span>
            <ChevronDown
              className={`ml-1 hidden h-3.5 w-3.5 transition-transform md:inline ${chartsOpen ? 'rotate-180' : ''}`}
            />
          </Button>
          <Button onClick={() => void refresh()} variant="outline" size="sm" disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 md:mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden md:inline">{refreshing ? 'Refreshing…' : 'Refresh'}</span>
          </Button>
          <Button onClick={() => void exportCsv()} variant="outline" size="sm">
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
            value={kpis.onHand.toLocaleString()}
            description="Across all products"
            icon={<Boxes />}
          />
        </button>
        <button className="w-full text-left" onClick={() => switchView('reservations')}>
          <KPI
            title="Available"
            value={kpis.available.toLocaleString()}
            description={`${kpis.reservedUnits.toLocaleString()} reserved on ${kpis.activeReservations} orders`}
            icon={<Package />}
          />
        </button>
        <button className="w-full text-left" onClick={() => jumpToBatches('ACTIVE')}>
          <KPI
            title="Active Batches"
            value={kpis.activeBatches.toLocaleString()}
            description="With stock or receiving"
            icon={<Boxes />}
          />
        </button>
        <button className="w-full text-left" onClick={() => switchView('low')}>
          <KPI
            title="Low Stock"
            value={kpis.lowStock.toLocaleString()}
            description="At or below reorder level"
            icon={<PackageX />}
          />
        </button>
        <button className="w-full text-left" onClick={() => jumpToBatches('EXPIRING')}>
          <KPI
            title="Expiring ≤ 90d"
            value={kpis.expiringSoon.toLocaleString()}
            description="Batches nearing BUD"
            icon={<CalendarClock />}
          />
        </button>
        <button className="w-full text-left" onClick={() => jumpToBatches('EXPIRED')}>
          <KPI
            title="Expired"
            value={kpis.expired.toLocaleString()}
            description="Past BUD with stock"
            icon={<AlertTriangle />}
          />
        </button>
      </div>

      {/* Analytics (lazy; recharts loads only when opened) */}
      {chartsOpen && (
        <InventoryCharts summary={summary} onWindowChange={(days) => void loadSummary(days)} />
      )}

      {/* View tabs + search */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs value={view} onValueChange={(v) => switchView(v as View)}>
          <TabsList>
            <TabsTrigger value="batches">Batches</TabsTrigger>
            <TabsTrigger value="products">By Product</TabsTrigger>
            <TabsTrigger value="low">
              Low Stock
              {kpis.lowStock > 0 && (
                <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {kpis.lowStock}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="reservations">
              Reserved
              {kpis.activeReservations > 0 && (
                <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-bold text-white">
                  {kpis.activeReservations}
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
            onChange={(e) => {
              setSearch(e.target.value)
              setBatchPage(1)
              setLogPage(1)
              setResPage(1)
            }}
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
              onClick={() => {
                setBatchFilter(key)
                setBatchPage(1)
              }}
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

      {/* Activity filters */}
      {view === 'log' && (
        <div className="-mt-2 flex flex-wrap items-center gap-2">
          <Select
            value={logReason}
            onValueChange={(v) => {
              setLogReason(v)
              setLogPage(1)
            }}
          >
            <SelectTrigger className="h-8 w-[190px] text-xs">
              <SelectValue placeholder="All reasons" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All reasons</SelectItem>
              {Object.entries(REASON_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={logFrom}
            onChange={(e) => {
              setLogFrom(e.target.value)
              setLogPage(1)
            }}
            className="h-8 w-[150px] text-xs"
            aria-label="From date"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={logTo}
            onChange={(e) => {
              setLogTo(e.target.value)
              setLogPage(1)
            }}
            className="h-8 w-[150px] text-xs"
            aria-label="To date"
          />
          {(logReason !== 'ALL' || logFrom || logTo) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                setLogReason('ALL')
                setLogFrom('')
                setLogTo('')
                setLogPage(1)
              }}
            >
              Clear
            </Button>
          )}
        </div>
      )}

      {/* Reservations summary strip */}
      {view === 'reservations' && resData && resData.total > 0 && (
        <p className="-mt-2 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{resData.total}</span> active
          reservation{resData.total !== 1 ? 's' : ''} holding{' '}
          <span className="font-semibold text-blue-600 dark:text-blue-400">
            {resData.totalUnits.toLocaleString()}
          </span>{' '}
          vials for open orders.
        </p>
      )}

      {/* Active view */}
      {view === 'batches' && (
        <>
          <BatchesTable
            rows={batchData.rows}
            loading={batchLoading}
            sortKey={batchSort.key}
            sortDir={batchSort.dir}
            onSort={onBatchSort}
            onOpen={setOpenBatchId}
          />
          <Pagination
            currentPage={batchPage}
            totalPages={batchTotalPages}
            totalItems={batchData.total}
            pageSize={batchPageSize}
            onPageChange={setBatchPage}
            onPageSizeChange={(size) => {
              setBatchPageSize(size)
              setBatchPage(1)
            }}
          />
        </>
      )}
      {view === 'products' && <ProductsTable rows={visibleProducts} onOpen={setOpenProduct} />}
      {view === 'low' && <ProductsTable rows={visibleLow} onOpen={setOpenProduct} />}
      {view === 'reservations' && (
        <>
          <ReservationsTable rows={resData?.rows ?? []} loading={resLoading || resData === null} />
          <Pagination
            currentPage={resPage}
            totalPages={resTotalPages}
            totalItems={resData?.total ?? 0}
            pageSize={resPageSize}
            onPageChange={setResPage}
            onPageSizeChange={(size) => {
              setResPageSize(size)
              setResPage(1)
            }}
          />
        </>
      )}
      {view === 'log' && (
        <>
          <ActivityTable rows={logData?.rows ?? []} loading={logLoading || logData === null} />
          <Pagination
            currentPage={logPage}
            totalPages={logTotalPages}
            totalItems={logData?.total ?? 0}
            pageSize={logPageSize}
            onPageChange={setLogPage}
            onPageSizeChange={(size) => {
              setLogPageSize(size)
              setLogPage(1)
            }}
          />
        </>
      )}

      {/* Detail sheets */}
      <BatchDetailSheet
        batchId={openBatchId}
        onOpenChange={(open) => !open && setOpenBatchId(null)}
        onChanged={() => void refresh()}
      />
      <ProductDetailSheet
        row={openProductSynced}
        onOpenChange={(open) => !open && setOpenProduct(null)}
        onChanged={() => void refresh()}
        onOpenBatch={(id) => setOpenBatchId(id)}
      />

      <ReceiveInventoryModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onReceived={() => void refresh()}
        catalog={catalog}
      />
    </div>
  )
}
