'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { InvoicePayDialog } from '@/components/shop/InvoicePayDialog'
import {
  FileText,
  Download,
  CreditCard,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Receipt,
} from 'lucide-react'

interface InvoiceRow {
  id: string
  invoiceNumber: string
  status: 'OPEN' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'VOID'
  issueDate: string
  dueDate: string | null
  paymentTermsDays: number
  grossTotal: number
  totalPayments: number
  amountDue: number
  daysPastDue: number
}

interface Summary {
  openBalance: number
  paymentTermsDays: number | null
  creditLimit: number | null
}

const statusStyles: Record<InvoiceRow['status'], { label: string; className: string }> = {
  OPEN: { label: 'Open', className: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  PARTIAL: { label: 'Partially Paid', className: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  PAID: { label: 'Paid', className: 'bg-green-500/20 text-green-300 border-green-500/30' },
  OVERDUE: { label: 'Overdue', className: 'bg-red-500/20 text-red-300 border-red-500/30' },
  VOID: { label: 'Void', className: 'bg-white/10 text-white/50 border-white/20' },
}

const formatPrice = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
const formatDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—'

export default function ShopInvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [paying, setPaying] = useState<InvoiceRow | null>(null)
  const [justPaid, setJustPaid] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/shop/invoices')
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.message || data.error || 'Failed to load invoices')
        return data
      })
      .then((data) => {
        setInvoices(data.invoices ?? [])
        setSummary(data.summary ?? null)
        setError(null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load invoices'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openCount = useMemo(
    () => invoices.filter((i) => i.status === 'OPEN' || i.status === 'PARTIAL' || i.status === 'OVERDUE').length,
    [invoices]
  )
  const overdueTotal = useMemo(
    () => invoices.filter((i) => i.status === 'OVERDUE').reduce((s, i) => s + i.amountDue, 0),
    [invoices]
  )

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-xl bg-brand-primary/20 flex items-center justify-center">
          <Receipt className="h-6 w-6 text-brand-primary" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl md:text-2xl font-bold text-white">Invoices &amp; Billing</h1>
          <p className="text-sm text-white/50">Your account statements and payments</p>
        </div>
        <a
          href="/api/shop/statements/pdf"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white"
        >
          <Download className="h-4 w-4" /> Statement (last month)
        </a>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="bg-[#0a0e3a] border-white/10 rounded-2xl">
          <CardContent className="p-4">
            <p className="text-xs text-white/50 mb-1">Balance due</p>
            <p className="text-xl font-bold text-white">{formatPrice(summary?.openBalance ?? 0)}</p>
            <p className="text-xs text-white/40 mt-1">{openCount} open invoice(s)</p>
          </CardContent>
        </Card>
        <Card className="bg-[#0a0e3a] border-white/10 rounded-2xl">
          <CardContent className="p-4">
            <p className="text-xs text-white/50 mb-1">Past due</p>
            <p className={`text-xl font-bold ${overdueTotal > 0 ? 'text-red-400' : 'text-white'}`}>
              {formatPrice(overdueTotal)}
            </p>
            {overdueTotal > 0 && (
              <p className="text-xs text-red-400/80 mt-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Please pay promptly
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="bg-[#0a0e3a] border-white/10 rounded-2xl col-span-2 md:col-span-1">
          <CardContent className="p-4">
            <p className="text-xs text-white/50 mb-1">Account terms</p>
            <p className="text-xl font-bold text-white">
              {summary?.paymentTermsDays ? `Net ${summary.paymentTermsDays}` : 'Card only'}
            </p>
            {summary?.creditLimit != null && (
              <p className="text-xs text-white/40 mt-1">
                Credit limit {formatPrice(summary.creditLimit)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {justPaid && (
        <div className="rounded-xl bg-green-500/10 border border-green-500/30 text-green-300 text-sm p-3 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> Payment received — thank you!
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm p-3">
          {error}
        </div>
      )}

      {/* Invoice list */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-white/50">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : invoices.length === 0 ? (
        <Card className="bg-[#0a0e3a] border-white/10 rounded-2xl">
          <CardContent className="py-16 flex flex-col items-center text-center">
            <FileText className="h-12 w-12 text-white/20 mb-4" />
            <p className="text-white font-medium mb-1">No invoices yet</p>
            <p className="text-white/50 text-sm max-w-[300px]">
              Invoices for orders billed to your account will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => {
            const style = statusStyles[inv.status]
            const payable =
              (inv.status === 'OPEN' || inv.status === 'PARTIAL' || inv.status === 'OVERDUE') &&
              inv.amountDue > 0
            return (
              <Card key={inv.id} className="bg-[#0a0e3a] border-white/10 rounded-2xl">
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-semibold">{inv.invoiceNumber}</span>
                      <Badge variant="outline" className={style.className}>
                        {style.label}
                      </Badge>
                      {inv.status === 'OVERDUE' && inv.daysPastDue > 0 && (
                        <span className="text-xs text-red-400">{inv.daysPastDue}d past due</span>
                      )}
                    </div>
                    <p className="text-xs text-white/50 mt-1">
                      Issued {formatDate(inv.issueDate)} · Due {formatDate(inv.dueDate)} · Net{' '}
                      {inv.paymentTermsDays}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-white font-bold">
                      {inv.amountDue > 0 ? formatPrice(inv.amountDue) : formatPrice(inv.grossTotal)}
                    </p>
                    <p className="text-xs text-white/40">
                      {inv.amountDue > 0 ? 'amount due' : 'total'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="border-white/20 text-white hover:bg-white/10 rounded-xl"
                    >
                      <a href={`/api/shop/invoices/${inv.id}/pdf`} target="_blank" rel="noreferrer">
                        <Download className="h-4 w-4 mr-1" /> PDF
                      </a>
                    </Button>
                    {payable && (
                      <Button
                        size="sm"
                        className="bg-brand-primary hover:bg-[#1a30c0] text-white rounded-xl"
                        onClick={() => {
                          setJustPaid(false)
                          setPaying(inv)
                        }}
                      >
                        <CreditCard className="h-4 w-4 mr-1" /> Pay
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {paying && (
        <InvoicePayDialog
          invoiceId={paying.id}
          invoiceNumber={paying.invoiceNumber}
          amountDue={paying.amountDue}
          open={!!paying}
          onClose={() => setPaying(null)}
          onPaid={() => {
            setPaying(null)
            setJustPaid(true)
            load()
          }}
        />
      )}
    </div>
  )
}
