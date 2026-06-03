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

export default function InventoryClient({ initialBatches }: { initialBatches: BatchRow[] }) {
  // Seeded from the server render — no first-paint skeleton / client round trip.
  const [batches, setBatches] = useState<BatchRow[]>(initialBatches)
  const [refreshing, setRefreshing] = useState(false)
  const [view, setView] = useState<'batches' | 'products'>('batches')
  const [modalOpen, setModalOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  // `force` bypasses the browser cache for an explicit manual refresh.
  const loadData = useCallback(async (force = false) => {
    try {
      const url = `/api/admin/inventory/batches?status=ALL${force ? `&t=${Date.now()}` : ''}`
      const res = await fetch(url, force ? { cache: 'no-store' } : undefined)
      if (!res.ok) throw new Error('Failed to load batches')
      const data = await res.json()
      setBatches(data.batches ?? [])
    } catch (err) {
      console.error('Error loading batches', err)
    } finally {
      setRefreshing(false)
    }
  }, [])

  async function handleRefresh() {
    setRefreshing(true)
    await loadData(true)
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
    const totalOnHand = active.reduce((s, b) => s + b.qtyOnHand, 0)
    const products = new Set(active.map((b) => `${b.productName}|${b.dose}`))
    const expiringSoon = active.filter((b) => {
      const d = daysUntil(b.bud)
      return d >= 0 && d <= 90 && b.qtyOnHand > 0
    })
    const expired = active.filter((b) => daysUntil(b.bud) < 0 && b.qtyOnHand > 0)
    return { totalOnHand, products: products.size, batches: active.length, expiringSoon, expired }
  }, [active])

  const productRollup = useMemo(() => {
    const map = new Map<
      string,
      { productName: string; dose: string; onHand: number; batches: number; soonestBud: string | null }
    >()
    for (const b of active) {
      const key = `${b.productName}|${b.dose}`
      const cur = map.get(key) ?? {
        productName: b.productName,
        dose: b.dose,
        onHand: 0,
        batches: 0,
        soonestBud: null,
      }
      cur.onHand += b.qtyOnHand
      cur.batches += 1
      if (b.qtyOnHand > 0 && (!cur.soonestBud || new Date(b.bud) < new Date(cur.soonestBud))) {
        cur.soonestBud = b.bud
      }
      map.set(key, cur)
    }
    return Array.from(map.values()).sort((a, b) => a.productName.localeCompare(b.productName))
  }, [active])

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
          description="Across all active batches"
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
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Dose</th>
                <th className="px-4 py-3 text-right">On Hand</th>
                <th className="px-4 py-3 text-right">Batches</th>
                <th className="px-4 py-3">Soonest BUD</th>
              </tr>
            </thead>
            <tbody>
              {productRollup.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                    No active inventory.
                  </td>
                </tr>
              )}
              {productRollup.map((p) => (
                <tr key={`${p.productName}-${p.dose}`} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{p.productName}</td>
                  <td className="px-4 py-3">{p.dose}</td>
                  <td className="px-4 py-3 text-right">{p.onHand}</td>
                  <td className="px-4 py-3 text-right">{p.batches}</td>
                  <td className="px-4 py-3">{p.soonestBud ? fmtDate(p.soonestBud) : '—'}</td>
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
