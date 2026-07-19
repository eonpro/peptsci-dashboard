'use client'

/**
 * Table views for the Inventory workspace: Batches, Products, Reservations,
 * Activity. Each renders a desktop table (md+) and a mobile card list, with
 * clickable rows that open the corresponding detail sheet.
 *
 * Batches and Activity are server-paginated — their sort state is controlled
 * by the parent and forwarded to the API. Products / Low Stock operate on the
 * full (small) catalog client-side.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, Inbox, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  type AdjustmentRow,
  type BatchRow,
  type BatchSortKey,
  type ProductRollupRow,
  type ReservationRow,
  type SortDir,
  REASON_LABELS,
  ageLabel,
  budLabel,
  budTone,
  fmtDate,
  fmtDateTime,
  isLowStock,
} from './inventory-shared'

function EmptyRows({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border bg-card py-14 text-center">
      <Inbox className="h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

function LoadingRows() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border bg-card py-14 text-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/60" />
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  )
}

function SortHeader({
  label,
  dir,
  onClick,
  align = 'left',
}: {
  label: string
  dir: SortDir | null
  onClick: () => void
  align?: 'left' | 'right'
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 uppercase hover:text-foreground ${align === 'right' ? 'ml-auto' : ''}`}
    >
      {label}
      {dir === 'asc' ? (
        <ArrowUp className="h-3 w-3" />
      ) : dir === 'desc' ? (
        <ArrowDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  )
}

const batchStatusVariant = (status: BatchRow['status']) =>
  status === 'VOIDED' ? 'destructive' : status === 'DEPLETED' ? 'secondary' : 'default'

function BudCell({ bud }: { bud: string }) {
  const tone = budTone(bud)
  return (
    <span
      className={
        tone === 'expired'
          ? 'text-red-600 dark:text-red-400'
          : tone === 'soon'
            ? 'text-amber-600 dark:text-amber-400'
            : ''
      }
    >
      {fmtDate(bud)}
      <span className="ml-1.5 text-xs text-muted-foreground">{budLabel(bud)}</span>
    </span>
  )
}

// ── Batches (server-sorted) ──────────────────────────────────────────────────

export function BatchesTable({
  rows,
  loading,
  sortKey,
  sortDir,
  onSort,
  onOpen,
}: {
  rows: BatchRow[]
  loading: boolean
  sortKey: BatchSortKey
  sortDir: SortDir
  onSort: (key: BatchSortKey) => void
  onOpen: (id: string) => void
}) {
  if (loading && rows.length === 0) return <LoadingRows />
  if (rows.length === 0) {
    return <EmptyRows message="No batches match. Adjust filters or receive inventory." />
  }

  const dirFor = (key: BatchSortKey) => (sortKey === key ? sortDir : null)

  return (
    <div className={loading ? 'pointer-events-none opacity-60 transition-opacity' : ''}>
      {/* Desktop */}
      <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Batch #</th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">
                <SortHeader label="BUD" dir={dirFor('bud')} onClick={() => onSort('bud')} />
              </th>
              <th className="px-4 py-3 text-right">
                <SortHeader
                  label="On hand"
                  dir={dirFor('qtyOnHand')}
                  onClick={() => onSort('qtyOnHand')}
                  align="right"
                />
              </th>
              <th className="px-4 py-3">
                <SortHeader
                  label="Received"
                  dir={dirFor('receivedOn')}
                  onClick={() => onSort('receivedOn')}
                />
              </th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr
                key={b.id}
                onClick={() => onOpen(b.id)}
                className="cursor-pointer border-b last:border-0 hover:bg-muted/50"
              >
                <td className="px-4 py-3 font-mono text-xs font-semibold">{b.batchNumber}</td>
                <td className="px-4 py-3">
                  {b.productName} <span className="text-muted-foreground">· {b.dose}</span>
                </td>
                <td className="px-4 py-3">
                  <BudCell bud={b.bud} />
                </td>
                <td className="px-4 py-3 text-right font-semibold">
                  {b.qtyOnHand}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    / {b.qtyReceived}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{fmtDate(b.receivedOn)}</td>
                <td className="px-4 py-3">
                  <Badge variant={batchStatusVariant(b.status)}>{b.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="space-y-2 md:hidden">
        {rows.map((b) => (
          <li key={b.id}>
            <button
              onClick={() => onOpen(b.id)}
              className="w-full rounded-lg border bg-card p-3 text-left active:bg-muted/60"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-semibold">{b.batchNumber}</span>
                <Badge variant={batchStatusVariant(b.status)}>{b.status}</Badge>
              </div>
              <p className="mt-1 text-sm">
                {b.productName} <span className="text-muted-foreground">· {b.dose}</span>
              </p>
              <div className="mt-1.5 flex items-center justify-between text-xs">
                <BudCell bud={b.bud} />
                <span className="font-semibold">
                  {b.qtyOnHand} <span className="font-normal text-muted-foreground">on hand</span>
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Products (client-sorted, small catalog) ──────────────────────────────────

export function ProductsTable({
  rows,
  onOpen,
}: {
  rows: ProductRollupRow[]
  onOpen: (row: ProductRollupRow) => void
}) {
  const [sort, setSort] = useState<{ key: 'name' | 'available'; dir: SortDir }>({
    key: 'name',
    dir: 'asc',
  })

  const sorted = useMemo(() => {
    const list = [...rows]
    const mul = sort.dir === 'asc' ? 1 : -1
    list.sort((a, b) =>
      sort.key === 'name'
        ? a.productName.localeCompare(b.productName) * mul
        : (a.available - b.available) * mul
    )
    return list
  }, [rows, sort])

  const toggle = (key: typeof sort.key) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))

  if (rows.length === 0) {
    return <EmptyRows message="No products match." />
  }

  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">
                <SortHeader
                  label="Product"
                  dir={sort.key === 'name' ? sort.dir : null}
                  onClick={() => toggle('name')}
                />
              </th>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3 text-right">On hand</th>
              <th className="px-4 py-3 text-right">Reserved</th>
              <th className="px-4 py-3 text-right">
                <SortHeader
                  label="Available"
                  dir={sort.key === 'available' ? sort.dir : null}
                  onClick={() => toggle('available')}
                  align="right"
                />
              </th>
              <th className="px-4 py-3 text-right">Reorder at</th>
              <th className="px-4 py-3 text-right">Batches</th>
              <th className="px-4 py-3">Soonest BUD</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr
                key={p.variantId}
                onClick={() => onOpen(p)}
                className="cursor-pointer border-b last:border-0 hover:bg-muted/50"
              >
                <td className="px-4 py-3 font-medium">
                  {p.productName}{' '}
                  <span className="font-normal text-muted-foreground">· {p.dose}</span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {p.sku || '—'}
                </td>
                <td className="px-4 py-3 text-right">{p.onHand}</td>
                <td className="px-4 py-3 text-right text-blue-600 dark:text-blue-400">
                  {p.reserved || 0}
                </td>
                <td
                  className={`px-4 py-3 text-right font-semibold ${
                    p.available === 0
                      ? 'text-muted-foreground/60'
                      : isLowStock(p)
                        ? 'text-red-600 dark:text-red-400'
                        : ''
                  }`}
                >
                  {p.available}
                  {isLowStock(p) && (
                    <Badge variant="destructive" className="ml-2 px-1.5 py-0 text-[10px]">
                      Low
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">{p.reorderLevel}</td>
                <td className="px-4 py-3 text-right">{p.batches}</td>
                <td className="px-4 py-3">{p.soonestBud ? <BudCell bud={p.soonestBud} /> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-2 md:hidden">
        {sorted.map((p) => (
          <li key={p.variantId}>
            <button
              onClick={() => onOpen(p)}
              className="w-full rounded-lg border bg-card p-3 text-left active:bg-muted/60"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-medium">
                  {p.productName}{' '}
                  <span className="font-normal text-muted-foreground">· {p.dose}</span>
                </span>
                {isLowStock(p) && <Badge variant="destructive">Low</Badge>}
              </div>
              <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                <span>
                  <span
                    className={`font-semibold ${isLowStock(p) ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}
                  >
                    {p.available}
                  </span>{' '}
                  available
                </span>
                <span>{p.onHand} on hand</span>
                {p.reserved > 0 && (
                  <span className="text-blue-600 dark:text-blue-400">{p.reserved} reserved</span>
                )}
                <span className="ml-auto">
                  {p.batches} batch{p.batches !== 1 ? 'es' : ''}
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

// ── Reservations ─────────────────────────────────────────────────────────────

const orderStatusVariant = (status: string) =>
  status === 'CANCELLED' ? 'destructive' : status === 'DRAFT' ? 'secondary' : 'default'

export function ReservationsTable({
  rows,
  loading,
}: {
  rows: ReservationRow[]
  loading: boolean
}) {
  if (loading && rows.length === 0) return <LoadingRows />
  if (rows.length === 0) {
    return (
      <EmptyRows message="No active reservations — stock is only held while orders are open." />
    )
  }

  return (
    <div className={loading ? 'pointer-events-none opacity-60 transition-opacity' : ''}>
      <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3 text-right">Qty held</th>
              <th className="px-4 py-3">Order status</th>
              <th className="px-4 py-3 text-right">Held for</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0 hover:bg-muted/50">
                <td className="px-4 py-3">
                  <Link
                    href={`/fulfillment?search=${r.orderNumber}`}
                    className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                  >
                    #{r.orderNumber}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </td>
                <td className="max-w-[220px] truncate px-4 py-3">{r.customer || '—'}</td>
                <td className="px-4 py-3">
                  {r.productName}
                  {r.dose ? <span className="text-muted-foreground"> · {r.dose}</span> : null}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {r.sku || '—'}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-blue-600 dark:text-blue-400">
                  {r.quantity}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={orderStatusVariant(r.orderStatus)}>{r.orderStatus}</Badge>
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">
                  {ageLabel(r.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-2 md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="rounded-lg border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <Link
                href={`/fulfillment?search=${r.orderNumber}`}
                className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400"
              >
                #{r.orderNumber}
              </Link>
              <Badge variant={orderStatusVariant(r.orderStatus)}>{r.orderStatus}</Badge>
            </div>
            <p className="mt-1 text-sm">
              {r.productName}
              {r.dose ? <span className="text-muted-foreground"> · {r.dose}</span> : null}
            </p>
            <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
              <span className="min-w-0 truncate">{r.customer || '—'}</span>
              <span>
                <span className="font-semibold text-blue-600 dark:text-blue-400">
                  {r.quantity}
                </span>{' '}
                held · {ageLabel(r.createdAt)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Activity log ─────────────────────────────────────────────────────────────

export function ActivityTable({ rows, loading }: { rows: AdjustmentRow[]; loading: boolean }) {
  if (loading && rows.length === 0) {
    return <LoadingRows />
  }
  if (rows.length === 0) {
    return <EmptyRows message="No inventory movements recorded yet." />
  }

  return (
    <div className={loading ? 'pointer-events-none opacity-60 transition-opacity' : ''}>
      <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3 text-right">Change</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3">Note</th>
              <th className="px-4 py-3">By</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-b last:border-0 hover:bg-muted/50">
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {fmtDateTime(a.createdAt)}
                </td>
                <td className="px-4 py-3 font-medium">
                  {a.productName}
                  {a.dose ? <span className="text-muted-foreground"> · {a.dose}</span> : null}
                </td>
                <td
                  className={`px-4 py-3 text-right font-semibold ${a.delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
                >
                  {a.delta > 0 ? `+${a.delta}` : a.delta}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={a.delta > 0 ? 'default' : 'secondary'}>
                    {REASON_LABELS[a.reason] ?? a.reason}
                  </Badge>
                </td>
                <td className="max-w-[280px] truncate px-4 py-3 text-muted-foreground">
                  {a.note || '—'}
                </td>
                <td className="px-4 py-3">{a.by}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-2 md:hidden">
        {rows.map((a) => (
          <li key={a.id} className="rounded-lg border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-sm font-medium">
                {a.productName}
                {a.dose ? <span className="text-muted-foreground"> · {a.dose}</span> : null}
              </span>
              <span
                className={`font-semibold ${a.delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
              >
                {a.delta > 0 ? `+${a.delta}` : a.delta}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>{REASON_LABELS[a.reason] ?? a.reason}</span>
              <span>{fmtDateTime(a.createdAt)}</span>
            </div>
            {a.note && (
              <p className="mt-1 truncate text-xs italic text-muted-foreground">{a.note}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
