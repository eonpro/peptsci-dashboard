'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, Search, Trash2, CreditCard } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { filterCatalogVariantsForPicker } from '@/lib/catalog-variant-picker'
import {
  applyBillPeriodSelection,
  billPeriodBounds,
} from '@/lib/invoicing/bill-period'
import { toast } from 'sonner'

type ClientOption = {
  id: string
  organizationName: string
  paysAtCost?: boolean
  paymentTermsDays?: number | null
}
type UnbilledOrder = {
  id: string
  orderNumber: number
  total: number
  createdAt: string
  status: string
}
type VariantRow = {
  id: string
  sku: string | null
  productName: string
  dose: string | null
  srp: number
  unitCost: number
  available: number
}
type ProductLine = {
  key: string
  variantId?: string
  description: string
  quantity: number
  unitPrice: number
  priceSource: 'auto' | 'manual'
}
type SavedCard = {
  id: string
  cardBrand: string | null
  cardLast4: string | null
  isDefault: boolean
}

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

export type NewInvoiceDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (msg?: string) => void
  /** Prefill client (e.g. from client detail → Bill period). */
  initialClientId?: string | null
  /** Prefill bill period YYYY-MM-DD (order create date). */
  initialPeriodFrom?: string | null
  initialPeriodTo?: string | null
}

export default function NewInvoiceDialog({
  open,
  onOpenChange,
  onCreated,
  initialClientId = null,
  initialPeriodFrom = null,
  initialPeriodTo = null,
}: NewInvoiceDialogProps) {
  const [clients, setClients] = useState<ClientOption[]>([])
  const [variants, setVariants] = useState<VariantRow[]>([])
  const [clientId, setClientId] = useState<string>('')
  const [periodFrom, setPeriodFrom] = useState('')
  const [periodTo, setPeriodTo] = useState('')
  const [orders, setOrders] = useState<(UnbilledOrder & { selected: boolean })[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [productQuery, setProductQuery] = useState('')
  const [productLines, setProductLines] = useState<ProductLine[]>([])
  const [customPriceMap, setCustomPriceMap] = useState<Record<string, number>>({})
  const [savedCards, setSavedCards] = useState<SavedCard[]>([])
  const [chargeSavedCard, setChargeSavedCard] = useState(false)
  const [terms, setTerms] = useState('0')
  const [notes, setNotes] = useState('')
  const [issue, setIssue] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setClientId(initialClientId ?? '')
    setPeriodFrom(initialPeriodFrom ?? '')
    setPeriodTo(initialPeriodTo ?? '')
    Promise.all([
      fetch('/api/admin/clients').then((r) => r.json()).catch(() => ({})),
      fetch('/api/admin/products').then((r) => r.json()).catch(() => ({})),
    ]).then(([c, p]) => {
      setClients(c.clients ?? [])
      setVariants(p.variants ?? [])
    })
  }, [open, initialClientId, initialPeriodFrom, initialPeriodTo])

  // Default payment terms from the selected client's profile.
  useEffect(() => {
    if (!clientId) return
    const c = clients.find((x) => x.id === clientId)
    if (c?.paymentTermsDays != null) {
      setTerms(String(c.paymentTermsDays))
    }
  }, [clientId, clients])

  useEffect(() => {
    if (!clientId) {
      setOrders([])
      setSavedCards([])
      setChargeSavedCard(false)
      setCustomPriceMap({})
      return
    }
    setOrdersLoading(true)
    // Load all unbilled; period only drives selection (ops can still toggle).
    fetch(`/api/admin/invoices/unbilled?clientId=${encodeURIComponent(clientId)}`)
      .then((r) => r.json())
      .then((d) => {
        const rows: UnbilledOrder[] = d.orders ?? []
        setOrders(applyBillPeriodSelection(rows, periodFrom || null, periodTo || null))
      })
      .catch(() => setOrders([]))
      .finally(() => setOrdersLoading(false))

    fetch(`/api/admin/clients/${encodeURIComponent(clientId)}/stripe`)
      .then((r) => (r.ok ? r.json() : { paymentMethods: [] }))
      .then((d) => {
        const cards: SavedCard[] = d.paymentMethods ?? []
        setSavedCards(cards)
        setChargeSavedCard(cards.length > 0)
        if (cards.length > 0) setIssue(true)
      })
      .catch(() => {
        setSavedCards([])
        setChargeSavedCard(false)
      })
    // periodFrom/To applied in a separate effect so changing dates doesn't refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: load on client change only
  }, [clientId])

  // Re-apply selection when bill period changes (keep the full unbilled list visible).
  useEffect(() => {
    setOrders((prev) => applyBillPeriodSelection(prev, periodFrom || null, periodTo || null))
  }, [periodFrom, periodTo])

  // Client pricing for auto-priced product lines
  useEffect(() => {
    if (!clientId) return
    const paysAtCost = clients.find((c) => c.id === clientId)?.paysAtCost ?? false
    let cancelled = false
    fetch(`/api/admin/client-pricing?clientId=${encodeURIComponent(clientId)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (cancelled) return
        const rows: Array<{ variantId: string; customPrice: number }> = Array.isArray(data)
          ? data
          : (data.prices ?? [])
        const map: Record<string, number> = {}
        for (const row of rows) {
          if (row.variantId && typeof row.customPrice === 'number') {
            map[row.variantId] = row.customPrice
          }
        }
        setCustomPriceMap(map)
        setProductLines((prev) =>
          prev.map((l) => {
            if (l.priceSource !== 'auto' || !l.variantId) return l
            const v = variants.find((x) => x.id === l.variantId)
            if (!v) return l
            const next =
              paysAtCost && v.unitCost > 0 ? v.unitCost : (map[l.variantId] ?? v.srp)
            return { ...l, unitPrice: next }
          })
        )
      })
      .catch(() => {
        if (!cancelled) setCustomPriceMap({})
      })
    return () => {
      cancelled = true
    }
  }, [clientId, clients, variants])

  const reset = () => {
    setClientId('')
    setPeriodFrom('')
    setPeriodTo('')
    setOrders([])
    setProductQuery('')
    setProductLines([])
    setCustomPriceMap({})
    setSavedCards([])
    setChargeSavedCard(false)
    setTerms('0')
    setNotes('')
    setIssue(true)
    setSubmitError(null)
  }

  const clientPaysAtCost = clients.find((c) => c.id === clientId)?.paysAtCost ?? false
  const resolveUnitPrice = (v: VariantRow) =>
    clientPaysAtCost && v.unitCost > 0 ? v.unitCost : (customPriceMap[v.id] ?? v.srp)

  const filteredVariants = useMemo(
    () => filterCatalogVariantsForPicker(variants, productQuery),
    [variants, productQuery]
  )

  const addProduct = (v: VariantRow) => {
    setProductLines((prev) => {
      if (prev.some((l) => l.variantId === v.id)) return prev
      const label = `${v.productName}${v.dose ? ` ${v.dose}` : ''}${v.sku ? ` · ${v.sku}` : ''}`
      return [
        ...prev,
        {
          key: `v-${v.id}`,
          variantId: v.id,
          description: label,
          quantity: 1,
          unitPrice: resolveUnitPrice(v),
          priceSource: 'auto',
        },
      ]
    })
    setProductQuery('')
  }

  const addCustomLine = () => {
    setProductLines((prev) => [
      ...prev,
      {
        key: `c-${Date.now()}`,
        description: '',
        quantity: 1,
        unitPrice: 0,
        priceSource: 'manual',
      },
    ])
  }

  const updateProductLine = (key: string, patch: Partial<ProductLine>) =>
    setProductLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l
        const next = { ...l, ...patch }
        if (patch.unitPrice !== undefined) next.priceSource = 'manual'
        return next
      })
    )

  const removeProductLine = (key: string) =>
    setProductLines((prev) => prev.filter((l) => l.key !== key))

  const ordersTotal = orders.filter((o) => o.selected).reduce((s, o) => s + o.total, 0)
  const productsTotal = productLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0)
  const selectedTotal = ordersTotal + productsTotal
  const selectedCount = orders.filter((o) => o.selected).length

  const defaultCard = savedCards.find((c) => c.isDefault) ?? savedCards[0]
  const cardLabel = defaultCard
    ? `${(defaultCard.cardBrand || 'Card').replace(/\b\w/g, (c) => c.toUpperCase())} ···· ${defaultCard.cardLast4 ?? '????'}`
    : null

  const submit = () => {
    const orderIds = orders.filter((o) => o.selected).map((o) => o.id)
    const lineItems = productLines
      .filter((l) => l.description.trim() && l.quantity > 0 && l.unitPrice >= 0)
      .map((l) => ({
        description: l.description.trim(),
        quantity: Math.max(1, Math.floor(l.quantity)),
        unitPrice: Math.round(l.unitPrice * 100) / 100,
        ...(l.variantId ? { variantId: l.variantId } : {}),
      }))

    if (!clientId) {
      setSubmitError('Select a client')
      return
    }
    if (orderIds.length === 0 && lineItems.length === 0) {
      setSubmitError('Add at least one product or unbilled order')
      return
    }
    if (productLines.some((l) => !l.description.trim())) {
      setSubmitError('Every product line needs a description')
      return
    }

    const { periodStart, periodEnd } = billPeriodBounds(
      periodFrom || null,
      periodTo || null
    )

    const willCharge = chargeSavedCard && savedCards.length > 0
    setSubmitting(true)
    setSubmitError(null)
    fetch('/api/admin/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId,
        orderIds: orderIds.length > 0 ? orderIds : undefined,
        lineItems: lineItems.length > 0 ? lineItems : undefined,
        paymentTermsDays: Number(terms),
        notes: notes.trim() || undefined,
        issue: willCharge ? true : issue,
        chargeSavedCard: willCharge || undefined,
        periodStart: periodStart?.toISOString(),
        periodEnd: periodEnd?.toISOString(),
      }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.message || data.error || 'Failed to create invoice')
        return data
      })
      .then((data) => {
        reset()
        const charge = data.charge as { status?: string; message?: string } | null | undefined
        if (!willCharge) {
          onCreated('Invoice created')
          return
        }
        if (charge?.status === 'paid' || charge?.status === 'nothing_due') {
          onCreated('Invoice created and card charged')
          return
        }
        if (charge?.status === 'no_card') {
          onCreated('Invoice created — no card on file to charge')
          return
        }
        if (charge?.status === 'failed' || charge?.status === 'stripe_unconfigured') {
          toast.warning(
            `Invoice created, but charge failed: ${charge.message || charge.status}. Retry from the invoice page.`
          )
          onCreated()
          return
        }
        if (charge?.status === 'requires_action') {
          toast.warning('Invoice created — card requires authentication. Retry from the invoice page.')
          onCreated()
          return
        }
        onCreated('Invoice created')
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
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New invoice</DialogTitle>
          <DialogDescription>
            Bill a client for unbilled orders and/or catalog products. Set a bill period to
            select orders by create date.
          </DialogDescription>
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
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-white/60">
                  Bill period from
                </label>
                <Input
                  type="date"
                  value={periodFrom}
                  onChange={(e) => setPeriodFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/60">
                  Bill period to
                </label>
                <Input
                  type="date"
                  value={periodTo}
                  onChange={(e) => setPeriodTo(e.target.value)}
                />
              </div>
              {(periodFrom || periodTo) && (
                <p className="sm:col-span-2 text-xs text-white/50">
                  Selecting {selectedCount} of {orders.length} unbilled order
                  {orders.length === 1 ? '' : 's'} by create date
                  {periodFrom || periodTo
                    ? ` (${periodFrom || '…'} → ${periodTo || '…'})`
                    : ''}
                  .
                </p>
              )}
            </div>
          )}

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
                <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                  {orders.map((o, idx) => (
                    <label
                      key={o.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-md border p-2 ${
                        o.selected ? 'border-white/10' : 'border-white/5 opacity-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={o.selected}
                        onChange={(e) =>
                          setOrders((prev) =>
                            prev.map((p, i) =>
                              i === idx ? { ...p, selected: e.target.checked } : p
                            )
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

          {clientId && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-xs font-medium text-white/60">Products</label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={addCustomLine}
                >
                  <Plus className="mr-1 h-3 w-3" /> Custom line
                </Button>
              </div>
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
                <Input
                  className="pl-8"
                  placeholder="Search catalog to add…"
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                />
                {productQuery.trim() && filteredVariants.length > 0 && (
                  <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-white/10 bg-zinc-900 shadow-lg">
                    {filteredVariants.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-white/5"
                        onClick={() => addProduct(v)}
                      >
                        <span className="min-w-0 truncate text-white">
                          {v.productName}
                          {v.dose ? ` ${v.dose}` : ''}
                          {v.sku ? (
                            <span className="text-white/40"> · {v.sku}</span>
                          ) : null}
                        </span>
                        <span className="shrink-0 text-white/60">{usd(resolveUnitPrice(v))}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {productLines.length === 0 ? (
                <p className="py-1 text-sm text-white/40">No products added yet.</p>
              ) : (
                <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                  {productLines.map((l) => (
                    <div
                      key={l.key}
                      className="flex flex-wrap items-center gap-2 rounded-md border border-white/10 p-2"
                    >
                      <Input
                        className="min-w-[10rem] flex-1"
                        placeholder="Description"
                        value={l.description}
                        onChange={(e) => updateProductLine(l.key, { description: e.target.value })}
                      />
                      <Input
                        className="w-16"
                        type="number"
                        min={1}
                        step={1}
                        value={l.quantity}
                        onChange={(e) =>
                          updateProductLine(l.key, {
                            quantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                          })
                        }
                      />
                      <Input
                        className="w-24"
                        type="number"
                        min={0}
                        step={0.01}
                        value={l.unitPrice}
                        onChange={(e) =>
                          updateProductLine(l.key, {
                            unitPrice: Math.max(0, parseFloat(e.target.value) || 0),
                          })
                        }
                      />
                      <span className="w-16 text-right text-sm text-white/70">
                        {usd(l.quantity * l.unitPrice)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-white/50"
                        onClick={() => removeProductLine(l.key)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
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
                  <SelectItem value="14">Net 14</SelectItem>
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
            <Input
              placeholder="Memo shown on the invoice"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-white/70">
            <input
              type="checkbox"
              checked={issue || chargeSavedCard}
              onChange={(e) => {
                if (chargeSavedCard) return
                setIssue(e.target.checked)
              }}
              disabled={chargeSavedCard}
              className="h-4 w-4 accent-brand-primary"
            />
            Issue immediately (otherwise saved as draft)
          </label>

          {clientId && savedCards.length > 0 && (
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-white/10 p-3 text-sm text-white/80">
              <input
                type="checkbox"
                checked={chargeSavedCard}
                onChange={(e) => {
                  setChargeSavedCard(e.target.checked)
                  if (e.target.checked) setIssue(true)
                }}
                className="mt-0.5 h-4 w-4 accent-brand-primary"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 font-medium text-white">
                  <CreditCard className="h-3.5 w-3.5" />
                  Charge card on file
                </span>
                <span className="mt-0.5 block text-xs text-white/50">{cardLabel}</span>
              </span>
            </label>
          )}

          {clientId && savedCards.length === 0 && (
            <p className="text-xs text-white/40">No card on file for this client.</p>
          )}

          {submitError && <p className="text-sm text-red-400">{submitError}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {chargeSavedCard && savedCards.length > 0 ? 'Create & charge' : 'Create invoice'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
