'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ReceiptText, Loader2, Plus, FileX, Clock, Search } from 'lucide-react'
import { Pagination } from '@/components/Pagination'
import { toast } from 'sonner'

type InvoiceView = {
  invoice: {
    id: string
    invoiceNumber: number
    status: string
    issueDate: string
    dueDate: string | null
    client: { id: string; organizationName: string } | null
  }
  totals: { grossTotal: number; amountDue: number }
  aging: string
  daysPastDue: number
}

const STATUS_TABS = ['ALL', 'DRAFT', 'OPEN', 'PARTIAL', 'OVERDUE', 'PAID', 'VOID'] as const

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-white/10 text-white/60 border-white/20',
  OPEN: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  PARTIAL: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  OVERDUE: 'bg-red-500/15 text-red-300 border-red-500/30',
  PAID: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  VOID: 'bg-white/10 text-white/40 border-white/20',
}

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

export default function InvoicesPage() {
  const [rows, setRows] = useState<InvoiceView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<(typeof STATUS_TABS)[number]>('ALL')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [meta, setMeta] = useState<{ total: number; totalPages: number }>({
    total: 0,
    totalPages: 1,
  })

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    const qs = new URLSearchParams({ page: String(page), limit: String(pageSize) })
    if (status !== 'ALL') qs.set('status', status)
    if (search.trim()) qs.set('search', search.trim())
    fetch(`/api/admin/invoices?${qs.toString()}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.message || data.error || 'Failed to load invoices')
        return data
      })
      .then((data) => {
        setRows(data.invoices ?? [])
        setMeta({
          total: data.meta?.total ?? (data.invoices?.length ?? 0),
          totalPages: data.meta?.totalPages ?? 1,
        })
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load invoices'))
      .finally(() => setLoading(false))
  }, [status, search, page, pageSize])

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <ReceiptText className="h-6 w-6" /> Invoices
          </h1>
          <p className="mt-1 text-sm text-white/60">
            Bill accounts for orders, track payments and aging, and send statements.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> New Invoice
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <Input
            placeholder="Search by invoice # or client…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="pl-10"
          />
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg border border-white/10 p-1">
          {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setStatus(tab)
              setPage(1)
            }}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              status === tab ? 'bg-brand-primary text-white' : 'text-white/60 hover:text-white'
            }`}
          >
            {tab === 'ALL' ? 'All' : tab.charAt(0) + tab.slice(1).toLowerCase()}
          </button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-white/60">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
            </div>
          ) : error ? (
            <p className="py-8 text-center text-red-400">{error}</p>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-white/50">
              <FileX className="mb-3 h-10 w-10" />
              No invoices found.
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {rows.map(({ invoice, totals, daysPastDue }) => (
                <Link
                  key={invoice.id}
                  href={`/invoices/${invoice.id}`}
                  className="flex items-center justify-between gap-3 py-4 transition-colors hover:bg-white/5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-white">
                        INV-{String(invoice.invoiceNumber).padStart(5, '0')}
                      </span>
                      <Badge variant="outline" className={`text-xs ${STATUS_STYLES[invoice.status] ?? ''}`}>
                        {invoice.status}
                      </Badge>
                      {invoice.status === 'OVERDUE' && daysPastDue > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-red-300">
                          <Clock className="h-3 w-3" /> {daysPastDue}d
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-white/60">
                      {invoice.client?.organizationName || 'Unknown client'} · Issued {fmtDate(invoice.issueDate)} ·
                      Due {fmtDate(invoice.dueDate)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold text-white">{usd(totals.amountDue)}</p>
                    <p className="text-xs text-white/40">of {usd(totals.grossTotal)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
          {!loading && !error && meta.total > 0 && (
            <Pagination
              className="mt-4 border-t border-white/10 pt-4"
              currentPage={page}
              totalPages={meta.totalPages}
              totalItems={meta.total}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size)
                setPage(1)
              }}
            />
          )}
        </CardContent>
      </Card>

      <NewInvoiceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={() => {
          setDialogOpen(false)
          toast.success('Invoice created')
          load()
        }}
      />
    </div>
  )
}

type ClientOption = { id: string; organizationName: string }
type UnbilledOrder = { id: string; orderNumber: number; total: number; createdAt: string; status: string }

function NewInvoiceDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const [clients, setClients] = useState<ClientOption[]>([])
  const [clientId, setClientId] = useState<string>('')
  const [orders, setOrders] = useState<(UnbilledOrder & { selected: boolean })[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [terms, setTerms] = useState('30')
  const [notes, setNotes] = useState('')
  const [issue, setIssue] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    fetch('/api/admin/clients')
      .then((r) => r.json())
      .then((d) => setClients(d.clients ?? []))
      .catch(() => setClients([]))
  }, [open])

  useEffect(() => {
    if (!clientId) {
      setOrders([])
      return
    }
    setOrdersLoading(true)
    fetch(`/api/admin/invoices/unbilled?clientId=${encodeURIComponent(clientId)}`)
      .then((r) => r.json())
      .then((d) => setOrders((d.orders ?? []).map((o: UnbilledOrder) => ({ ...o, selected: true }))))
      .catch(() => setOrders([]))
      .finally(() => setOrdersLoading(false))
  }, [clientId])

  const reset = () => {
    setClientId('')
    setOrders([])
    setTerms('30')
    setNotes('')
    setIssue(true)
    setSubmitError(null)
  }

  const selectedTotal = orders.filter((o) => o.selected).reduce((s, o) => s + o.total, 0)

  const submit = () => {
    const orderIds = orders.filter((o) => o.selected).map((o) => o.id)
    if (!clientId || orderIds.length === 0) {
      setSubmitError('Select a client and at least one order')
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    fetch('/api/admin/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId,
        orderIds,
        paymentTermsDays: Number(terms),
        notes: notes.trim() || undefined,
        issue,
      }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.message || data.error || 'Failed to create invoice')
        return data
      })
      .then(() => {
        reset()
        onCreated()
      })
      .catch((e) => setSubmitError(e instanceof Error ? e.message : 'Failed to create invoice'))
      .finally(() => setSubmitting(false))
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New invoice</DialogTitle>
          <DialogDescription>Bill a client for one or more unbilled orders.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-white/60">Client</label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a client…" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.organizationName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {clientId && (
            <div>
              <label className="mb-1 block text-xs font-medium text-white/60">Unbilled orders</label>
              {ordersLoading ? (
                <p className="py-3 text-sm text-white/50">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading orders…
                </p>
              ) : orders.length === 0 ? (
                <p className="py-2 text-sm text-white/50">No unbilled orders for this client.</p>
              ) : (
                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                  {orders.map((o, idx) => (
                    <label
                      key={o.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md border border-white/10 p-2"
                    >
                      <input
                        type="checkbox"
                        checked={o.selected}
                        onChange={(e) =>
                          setOrders((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, selected: e.target.checked } : p))
                          )
                        }
                        className="h-4 w-4 accent-brand-primary"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white">Order #{o.orderNumber}</p>
                        <p className="text-xs text-white/40">
                          {new Date(o.createdAt).toLocaleDateString()} · {o.status}
                        </p>
                      </div>
                      <span className="text-sm font-medium text-white">{usd(o.total)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-white/60">Payment terms</label>
              <Select value={terms} onValueChange={setTerms}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Due on receipt</SelectItem>
                  <SelectItem value="7">Net 7</SelectItem>
                  <SelectItem value="30">Net 30</SelectItem>
                  <SelectItem value="60">Net 60</SelectItem>
                  <SelectItem value="90">Net 90</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-white/60">Selected total</label>
              <div className="rounded-md border border-white/10 px-3 py-2 text-sm font-semibold text-white">
                {usd(selectedTotal)}
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-white/60">Notes (optional)</label>
            <Input placeholder="Memo shown on the invoice" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-white/70">
            <input
              type="checkbox"
              checked={issue}
              onChange={(e) => setIssue(e.target.checked)}
              className="h-4 w-4 accent-brand-primary"
            />
            Issue immediately (otherwise saved as draft)
          </label>

          {submitError && <p className="text-sm text-red-400">{submitError}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Create invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
