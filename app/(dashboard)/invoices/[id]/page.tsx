'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
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
import {
  ArrowLeft,
  Loader2,
  Download,
  Send,
  Ban,
  CheckCircle2,
  Plus,
  CreditCard,
} from 'lucide-react'

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-white/10 text-white/60 border-white/20',
  OPEN: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  PARTIAL: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  OVERDUE: 'bg-red-500/15 text-red-300 border-red-500/30',
  PAID: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  VOID: 'bg-white/10 text-white/40 border-white/20',
}

type InvoiceView = {
  invoice: {
    id: string
    invoiceNumber: number
    status: string
    issueDate: string
    dueDate: string | null
    paymentTermsDays: number
    notes: string | null
    client: { id: string; organizationName: string; contactEmail: string | null } | null
    lineItems: { id: string; description: string; quantity: number; unitPrice: string; amount: string }[]
    adjustments: { id: string; kind: string; amount: string | null; percent: string | null; reason: string }[]
    payments: { id: string; amount: string; method: string | null; reference: string | null; paidAt: string }[]
  }
  totals: {
    subtotal: number
    balanceForward: number
    totalAdjustments: number
    grossTotal: number
    totalPayments: number
    amountDue: number
  }
  aging: string
  daysPastDue: number
}

const dec = (s: string | null) => (s == null ? 0 : Number(s))

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const [view, setView] = useState<InvoiceView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  const [adjOpen, setAdjOpen] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/admin/invoices/${id}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.message || data.error || 'Failed to load invoice')
        return data
      })
      .then((data) => setView(data.invoice))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load invoice'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const action = async (fn: () => Promise<Response>, key: string, okMsg?: string) => {
    setBusy(key)
    setToast(null)
    try {
      const r = await fn()
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.message || data.error || 'Action failed')
      if (okMsg) setToast(okMsg)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-4xl items-center justify-center py-20 text-white/60">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
      </div>
    )
  }
  if (error && !view) {
    return <p className="mx-auto max-w-4xl py-8 text-center text-red-400">{error}</p>
  }
  if (!view) return null

  const { invoice, totals } = view
  const isVoid = invoice.status === 'VOID'
  const isDraft = invoice.status === 'DRAFT'

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/invoices" className="inline-flex items-center gap-1 text-sm text-white/60 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back to invoices
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            INV-{String(invoice.invoiceNumber).padStart(5, '0')}
            <Badge variant="outline" className={`text-xs ${STATUS_STYLES[invoice.status] ?? ''}`}>
              {invoice.status}
            </Badge>
          </h1>
          <p className="mt-1 text-sm text-white/60">
            {invoice.client?.organizationName} · Issued {fmtDate(invoice.issueDate)} · Due{' '}
            {fmtDate(invoice.dueDate)} ({invoice.paymentTermsDays === 0 ? 'Due on receipt' : `Net ${invoice.paymentTermsDays}`})
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" asChild>
            <a href={`/api/admin/invoices/${id}/pdf`} target="_blank" rel="noopener noreferrer">
              <Download className="mr-2 h-4 w-4" /> PDF
            </a>
          </Button>
          {!isVoid && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy === 'send'}
              onClick={() =>
                action(() => fetch(`/api/admin/invoices/${id}/send`, { method: 'POST' }), 'send', 'Invoice emailed to client')
              }
            >
              {busy === 'send' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Email
            </Button>
          )}
          {isDraft && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy === 'issue'}
              onClick={() =>
                action(
                  () =>
                    fetch(`/api/admin/invoices/${id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'issue' }),
                    }),
                  'issue',
                  'Invoice issued'
                )
              }
            >
              {busy === 'issue' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Issue
            </Button>
          )}
          {!isVoid && invoice.status !== 'PAID' && (
            <Button size="sm" onClick={() => setPayOpen(true)}>
              <CreditCard className="mr-2 h-4 w-4" /> Record Payment
            </Button>
          )}
          {!isVoid && (
            <Button
              size="sm"
              variant="ghost"
              className="text-red-300 hover:text-red-200"
              disabled={busy === 'void'}
              onClick={() => {
                if (!confirm('Void this invoice? This cannot be undone.')) return
                action(
                  () =>
                    fetch(`/api/admin/invoices/${id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'void' }),
                    }),
                  'void',
                  'Invoice voided'
                )
              }}
            >
              <Ban className="mr-2 h-4 w-4" /> Void
            </Button>
          )}
        </div>
      </div>

      {toast && <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{toast}</p>}
      {error && <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Line items</CardTitle>
          {!isVoid && (
            <Button size="sm" variant="ghost" onClick={() => setAdjOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Adjustment
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-white/5">
            {invoice.lineItems.map((li) => (
              <div key={li.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-white">{li.description}</span>
                <span className="text-white/70">
                  {li.quantity} × {usd(dec(li.unitPrice))} = {usd(dec(li.amount))}
                </span>
              </div>
            ))}
            {invoice.adjustments.map((a) => {
              const amt = a.kind === 'PERCENT' ? (totals.subtotal * dec(a.percent)) / 100 : dec(a.amount)
              return (
                <div key={a.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-white/80">
                    Adjustment{a.kind === 'PERCENT' ? ` (${dec(a.percent)}%)` : ''}
                    {a.reason ? ` — ${a.reason}` : ''}
                  </span>
                  <span className={amt < 0 ? 'text-emerald-300' : 'text-amber-300'}>{usd(amt)}</span>
                </div>
              )
            })}
          </div>

          <div className="mt-4 space-y-1 border-t border-white/10 pt-4 text-sm">
            <Row label="Subtotal" value={usd(totals.subtotal)} />
            {totals.balanceForward !== 0 && <Row label="Balance forward" value={usd(totals.balanceForward)} />}
            {totals.totalAdjustments !== 0 && <Row label="Adjustments" value={usd(totals.totalAdjustments)} />}
            <Row label="Total" value={usd(totals.grossTotal)} strong />
            {totals.totalPayments > 0 && <Row label="Payments" value={`-${usd(totals.totalPayments)}`} />}
            <div className="mt-1 flex items-center justify-between border-t border-white/10 pt-2">
              <span className="font-semibold text-white">Amount due</span>
              <span className={`text-lg font-bold ${totals.amountDue > 0 ? 'text-white' : 'text-emerald-300'}`}>
                {usd(totals.amountDue)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payments</CardTitle>
        </CardHeader>
        <CardContent>
          {invoice.payments.length === 0 ? (
            <p className="py-2 text-sm text-white/50">No payments recorded yet.</p>
          ) : (
            <div className="divide-y divide-white/5">
              {invoice.payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-white/70">
                    {fmtDate(p.paidAt)} · {p.method ?? 'payment'}
                    {p.reference ? ` · ${p.reference}` : ''}
                  </span>
                  <span className="font-medium text-emerald-300">{usd(dec(p.amount))}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <RecordPaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        amountDue={totals.amountDue}
        onSaved={() => {
          setPayOpen(false)
          load()
        }}
        invoiceId={id}
      />
      <AddAdjustmentDialog
        open={adjOpen}
        onOpenChange={setAdjOpen}
        onSaved={() => {
          setAdjOpen(false)
          load()
        }}
        invoiceId={id}
      />
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={strong ? 'font-semibold text-white' : 'text-white/60'}>{label}</span>
      <span className={strong ? 'font-semibold text-white' : 'text-white/80'}>{value}</span>
    </div>
  )
}

function RecordPaymentDialog({
  open,
  onOpenChange,
  amountDue,
  invoiceId,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  amountDue: number
  invoiceId: string
  onSaved: () => void
}) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('wire')
  const [reference, setReference] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setAmount(amountDue > 0 ? String(amountDue) : '')
      setReference('')
      setErr(null)
    }
  }, [open, amountDue])

  const submit = () => {
    const amt = Number(amount)
    if (!(amt > 0)) {
      setErr('Enter a positive amount')
      return
    }
    setSubmitting(true)
    setErr(null)
    fetch(`/api/admin/invoices/${invoiceId}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: amt, method, reference: reference.trim() || undefined }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.message || data.error || 'Failed to record payment')
      })
      .then(onSaved)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Failed to record payment'))
      .finally(() => setSubmitting(false))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-white/60">Amount</label>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/60">Method</label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="wire">Wire</SelectItem>
                <SelectItem value="ach">ACH</SelectItem>
                <SelectItem value="check">Check</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/60">Reference (optional)</label>
            <Input placeholder="Check #, wire ref…" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          {err && <p className="text-sm text-red-400">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AddAdjustmentDialog({
  open,
  onOpenChange,
  invoiceId,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  invoiceId: string
  onSaved: () => void
}) {
  const [kind, setKind] = useState<'FIXED' | 'PERCENT'>('FIXED')
  const [value, setValue] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setValue('')
      setReason('')
      setErr(null)
    }
  }, [open])

  const submit = () => {
    const v = Number(value)
    if (Number.isNaN(v) || v === 0) {
      setErr('Enter a non-zero value (negative = discount)')
      return
    }
    setSubmitting(true)
    setErr(null)
    fetch(`/api/admin/invoices/${invoiceId}/adjustments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind,
        ...(kind === 'FIXED' ? { amount: v } : { percent: v }),
        reason: reason.trim() || undefined,
      }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.message || data.error || 'Failed to add adjustment')
      })
      .then(onSaved)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Failed to add adjustment'))
      .finally(() => setSubmitting(false))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add adjustment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-white/60">Type</label>
              <Select value={kind} onValueChange={(v) => setKind(v as 'FIXED' | 'PERCENT')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIXED">Fixed ($)</SelectItem>
                  <SelectItem value="PERCENT">Percent (%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-white/60">
                {kind === 'FIXED' ? 'Amount ($)' : 'Percent (%)'}
              </label>
              <Input
                type="number"
                step="0.01"
                placeholder="negative = discount"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/60">Reason</label>
            <Input placeholder="e.g. Volume discount" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          {err && <p className="text-sm text-red-400">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Add adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
