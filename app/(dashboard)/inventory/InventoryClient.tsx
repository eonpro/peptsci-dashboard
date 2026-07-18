'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { KPI } from '@/components/KPI'
import {
  Package,
  Boxes,
  AlertTriangle,
  CalendarClock,
  RefreshCw,
  Plus,
  Printer,
  FileText,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

// Loaded on demand when the rep opens "Receive inventory" — keeps the modal's
// product picker + form out of the inventory page's initial bundle.
const ReceiveInventoryModal = dynamic(() => import('./ReceiveInventoryModal'), { ssr: false })

export interface BatchRow {
  id: string
  batchNumber: string
  productName: string
  dose: string
  vialSize: string | null
  purity: string
  bud: string
  receivedOn: string
  qtyReceived: number
  qtyDamaged: number
  qtyOnHand: number
  status: 'RECEIVED' | 'DEPLETED' | 'VOIDED'
  yearColor: string | null
  variant?: { sku: string | null }
}

export interface CatalogStockRow {
  variantId: string
  sku: string | null
  productName: string
  dose: string | null
  onHand: number
  reserved: number
  reorderLevel: number
}

interface AdjustmentRow {
  id: string
  createdAt: string
  delta: number
  reason: string
  note: string | null
  productName: string
  dose: string | null
  sku: string | null
  by: string
}

const REASON_LABELS: Record<string, string> = {
  RECEIPT: 'Received',
  ORDER_FULFILLMENT: 'Order fulfillment',
  RETURN: 'Return restock',
  MANUAL_ADJUSTMENT: 'Manual adjustment',
  DAMAGE: 'Damage',
  AUDIT: 'Audit',
}

const SHEET_MAX = 36

function daysUntil(iso: string): number {
  const d = new Date(iso).getTime()
  return Math.round((d - Date.now()) / 86_400_000)
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
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
  const [view, setView] = useState<'batches' | 'products' | 'log'>('batches')
  const [modalOpen, setModalOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const loadLog = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/inventory/adjustments?t=${Date.now()}`, {
        cache: 'no-store',
      })
      if (!res.ok) throw new Error('Failed to load activity log')
      const data = await res.json()
      setLog(data.adjustments ?? [])
    } catch (err) {
      console.error('Error loading activity log', err)
      setLog([])
    }
  }, [])

  // `force` bypasses the browser cache for an explicit manual refresh.
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
      } catch (err) {
        console.error('Error loading inventory', err)
        toast.error('Failed to refresh inventory — try again')
      } finally {
        setRefreshing(false)
      }
    },
    [log, loadLog]
  )

  async function handleRefresh() {
    setRefreshing(true)
    await loadData(true)
  }

  function openLog() {
    setView('log')
    if (log === null) loadLog()
  }

  async function downloadLabels(
    batch: BatchRow,
    opts: { proofMode?: boolean; quantity?: number }
  ) {
    setBusyId(batch.id)
    try {
      const res = await fetch('/api/admin/inventory/labels/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: batch.id, ...opts }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload.message || 'Failed to generate labels')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `peptsci-labels-${batch.batchNumber}${opts.proofMode ? '-proof' : ''}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate labels')
    } finally {
      setBusyId(null)
    }
  }

  async function voidBatch(batch: BatchRow) {
    const reason = window.prompt(`Void batch ${batch.batchNumber}? Enter a reason:`, '')
    if (reason === null) return
    setBusyId(batch.id)
    try {
      const res = await fetch(
        `/api/admin/inventory/batches/${batch.id}?reason=${encodeURIComponent(reason || 'Voided')}`,
        { method: 'DELETE' }
      )
      if (!res.ok) throw new Error('Failed to void batch')
      await loadData(true)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to void batch')
    } finally {
      setBusyId(null)
    }
  }

  const active = useMemo(() => batches.filter((b) => b.status !== 'VOIDED'), [batches])

  const metrics = useMemo(() => {
    // On-hand counts the whole catalog (imports/manual stock included), not
    // just batch-tracked receipts.
    const totalOnHand = catalog.reduce((s, v) => s + v.onHand, 0)
    const products = new Set(active.map((b) => `${b.productName}|${b.dose}`))
    const expiringSoon = active.filter((b) => {
      const d = daysUntil(b.bud)
      return d >= 0 && d <= 90 && b.qtyOnHand > 0
    })
    const expired = active.filter((b) => daysUntil(b.bud) < 0 && b.qtyOnHand > 0)
    return { totalOnHand, products: products.size, batches: active.length, expiringSoon, expired }
  }, [active, catalog])

  // Every catalog product appears here — 0 on hand until stock is received —
  // with batch aggregates merged in where they exist.
  const productRollup = useMemo(() => {
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
    return catalog
      .map((v) => {
        const agg =
          (v.sku ? batchAgg.get(`sku:${v.sku}`) : undefined) ??
          batchAgg.get(`nd:${v.productName}|${v.dose ?? ''}`) ?? { batches: 0, soonestBud: null }
        return {
          variantId: v.variantId,
          productName: v.productName,
          dose: v.dose ?? '—',
          sku: v.sku,
          onHand: v.onHand,
          reorderLevel: v.reorderLevel,
          batches: agg.batches,
          soonestBud: agg.soonestBud,
        }
      })
      .sort((a, b) => a.productName.localeCompare(b.productName))
  }, [active, catalog])

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Inventory</h2>
          <p className="text-muted-foreground mt-2">
            Batch-tracked stock. Record receipts, set BUD, and print labels.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleRefresh} variant="outline" size="sm" disabled={refreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Receive Inventory
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPI
          title="Vials On Hand"
          value={metrics.totalOnHand.toLocaleString()}
          description="Across all products"
          icon={<Boxes />}
        />
        <KPI
          title="Active Batches"
          value={metrics.batches.toLocaleString()}
          description={`${metrics.products} distinct products`}
          icon={<Package />}
        />
        <KPI
          title="Expiring ≤ 90 days"
          value={metrics.expiringSoon.length.toLocaleString()}
          description="Batches nearing BUD"
          icon={<CalendarClock />}
        />
        <KPI
          title="Expired"
          value={metrics.expired.length.toLocaleString()}
          description="Past BUD with stock"
          icon={<AlertTriangle />}
        />
      </div>

      <div className="flex gap-2">
        <Button
          variant={view === 'batches' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setView('batches')}
        >
          Batches
        </Button>
        <Button
          variant={view === 'products' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setView('products')}
        >
          By Product
        </Button>
        <Button variant={view === 'log' ? 'default' : 'outline'} size="sm" onClick={openLog}>
          Activity Log
        </Button>
      </div>

      {view === 'batches' ? (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Batch #</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Dose</th>
                <th className="px-4 py-3">BUD</th>
                <th className="px-4 py-3 text-right">On Hand</th>
                <th className="px-4 py-3 text-right">Received</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Labels</th>
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-500">
                    No batches yet. Click <span className="font-medium">Receive Inventory</span> to
                    add one.
                  </td>
                </tr>
              )}
              {batches.map((b) => {
                const d = daysUntil(b.bud)
                const expired = d < 0
                const soon = d >= 0 && d <= 90
                return (
                  <tr key={b.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs font-semibold">{b.batchNumber}</td>
                    <td className="px-4 py-3">{b.productName}</td>
                    <td className="px-4 py-3">{b.dose}</td>
                    <td className="px-4 py-3">
                      <span className={expired ? 'text-red-600' : soon ? 'text-amber-600' : ''}>
                        {fmtDate(b.bud)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">{b.qtyOnHand}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{b.qtyReceived}</td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          b.status === 'VOIDED'
                            ? 'destructive'
                            : b.status === 'DEPLETED'
                              ? 'secondary'
                              : 'default'
                        }
                      >
                        {b.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          title={`Print label sheet (${SHEET_MAX} per page)`}
                          disabled={busyId === b.id || b.status === 'VOIDED'}
                          onClick={() => {
                            const def = String(SHEET_MAX)
                            const entry = window.prompt(
                              `How many labels to print for ${b.batchNumber}?\n(${SHEET_MAX} fills a full sheet)`,
                              def
                            )
                            if (entry === null) return
                            const qty = Math.min(
                              SHEET_MAX,
                              Math.max(1, Math.trunc(Number(entry) || SHEET_MAX))
                            )
                            downloadLabels(b, { quantity: qty })
                          }}
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Proof (single label)"
                          disabled={busyId === b.id}
                          onClick={() => downloadLabels(b, { proofMode: true })}
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Void batch"
                          disabled={busyId === b.id || b.status === 'VOIDED'}
                          onClick={() => voidBatch(b)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : view === 'products' ? (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Dose</th>
                <th className="px-4 py-3 text-right">On Hand</th>
                <th className="px-4 py-3 text-right">Reorder At</th>
                <th className="px-4 py-3 text-right">Batches</th>
                <th className="px-4 py-3">Soonest BUD</th>
              </tr>
            </thead>
            <tbody>
              {productRollup.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                    No products in the catalog yet.
                  </td>
                </tr>
              )}
              {productRollup.map((p) => (
                <tr key={p.variantId} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{p.productName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.sku || '—'}</td>
                  <td className="px-4 py-3">{p.dose}</td>
                  <td
                    className={`px-4 py-3 text-right font-semibold ${
                      p.onHand === 0
                        ? 'text-gray-400'
                        : p.onHand <= p.reorderLevel
                          ? 'text-amber-600'
                          : ''
                    }`}
                  >
                    {p.onHand}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">{p.reorderLevel}</td>
                  <td className="px-4 py-3 text-right">{p.batches}</td>
                  <td className="px-4 py-3">{p.soonestBud ? fmtDate(p.soonestBud) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3 text-right">Change</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Note</th>
                <th className="px-4 py-3">By</th>
              </tr>
            </thead>
            <tbody>
              {log === null && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                    Loading activity…
                  </td>
                </tr>
              )}
              {log !== null && log.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                    No inventory movements recorded yet.
                  </td>
                </tr>
              )}
              {(log ?? []).map((a) => (
                <tr key={a.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                    {new Date(a.createdAt).toLocaleString('en-US', {
                      month: '2-digit',
                      day: '2-digit',
                      year: '2-digit',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {a.productName}
                    {a.dose ? <span className="text-gray-500"> · {a.dose}</span> : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{a.sku || '—'}</td>
                  <td
                    className={`px-4 py-3 text-right font-semibold ${
                      a.delta > 0 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {a.delta > 0 ? `+${a.delta}` : a.delta}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={a.delta > 0 ? 'default' : 'secondary'}>
                      {REASON_LABELS[a.reason] ?? a.reason}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{a.note || '—'}</td>
                  <td className="px-4 py-3">{a.by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ReceiveInventoryModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onReceived={() => loadData(true)}
      />
    </div>
  )
}
