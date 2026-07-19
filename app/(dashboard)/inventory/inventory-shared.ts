/**
 * Shared types + pure helpers for the Inventory workspace views.
 */

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
  notes?: string | null
  receivedByName?: string | null
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
  batches: number
  soonestBud: string | null
}

export interface AdjustmentRow {
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

export interface BatchEventRow {
  id: string
  type: string
  delta: number | null
  note: string | null
  performedBy: string | null
  createdAt: string
}

export interface ProductRollupRow {
  variantId: string
  productName: string
  dose: string
  sku: string | null
  onHand: number
  reserved: number
  available: number
  reorderLevel: number
  batches: number
  soonestBud: string | null
}

export interface ReservationRow {
  id: string
  orderId: string
  orderNumber: number
  orderStatus: string
  customer: string | null
  quantity: number
  createdAt: string
  productName: string
  dose: string | null
  sku: string | null
  variantId: string
}

/** Summary payload from GET /api/admin/inventory/summary. */
export interface InventorySummaryPayload {
  kpis: {
    onHand: number
    reserved: number
    available: number
    activeBatches: number
    lowStock: number
    expiringSoon: number
    expired: number
    activeReservations: number
    reservedUnits: number
  }
  movement: Array<{ date: string; inbound: number; outbound: number; net: number }>
  reasonTotals: Array<{ reason: string; inbound: number; outbound: number }>
  topProducts: Array<{
    variantId: string
    productName: string
    dose: string | null
    sku: string | null
    onHand: number
    reserved: number
    available: number
  }>
  expiringBatches: Array<{
    id: string
    batchNumber: string
    productName: string
    dose: string
    bud: string
    qtyOnHand: number
  }>
  windowDays: number
}

export type BatchScope = 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'DEPLETED' | 'VOIDED' | 'ALL'
export type BatchSortKey = 'bud' | 'qtyOnHand' | 'receivedOn' | 'createdAt'
export type SortDir = 'asc' | 'desc'

export const REASON_LABELS: Record<string, string> = {
  RECEIPT: 'Received',
  ORDER_FULFILLMENT: 'Order fulfillment',
  RETURN: 'Return restock',
  MANUAL_ADJUSTMENT: 'Manual adjustment',
  DAMAGE: 'Damage',
  AUDIT: 'Audit',
}

export const EVENT_LABELS: Record<string, string> = {
  RECEIVED: 'Received',
  ADJUSTED: 'Details edited',
  LABELS_PRINTED: 'Labels printed',
  ALLOCATED: 'Allocated to order',
  VOIDED: 'Voided',
}

/** Labels per printed sheet (Avery-style 36-up). */
export const SHEET_MAX = 36

export function daysUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Visual severity of a batch's beyond-use date. */
export function budTone(iso: string): 'expired' | 'soon' | 'ok' {
  const d = daysUntil(iso)
  if (d < 0) return 'expired'
  if (d <= 90) return 'soon'
  return 'ok'
}

/** Human label for a BUD relative to today ("in 45 days" / "expired 3 days ago"). */
export function budLabel(iso: string): string {
  const d = daysUntil(iso)
  if (d < 0) return `expired ${Math.abs(d)}d ago`
  if (d === 0) return 'expires today'
  return `${d}d left`
}

/** How long ago something happened, compact ("2h", "3d", "5w"). */
export function ageLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 1) return '<1h'
  if (hours < 48) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 14) return `${days}d`
  return `${Math.floor(days / 7)}w`
}

export function isLowStock(row: { available: number; reorderLevel: number }): boolean {
  return row.reorderLevel > 0 && row.available <= row.reorderLevel
}

/** Case-insensitive multi-field match for the workspace search box. */
export function matchesSearch(haystacks: Array<string | null | undefined>, term: string): boolean {
  const t = term.trim().toLowerCase()
  if (!t) return true
  return haystacks.some((h) => (h ?? '').toLowerCase().includes(t))
}

/** Build + trigger a CSV download from rows of cells. */
export function downloadCsv(
  filename: string,
  header: string[],
  rows: Array<Array<string | number | null>>
): void {
  const escape = (v: string | number | null): string => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [header, ...rows].map((r) => r.map(escape).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
