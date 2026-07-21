'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, Search, Trash2, ShoppingCart, UserPlus, AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { computeCartTotals } from '@/lib/checkout-core'

const inputCls =
  'rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-hidden focus:ring-1 focus:ring-ring'
const selectCls =
  'rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-hidden focus:ring-1 focus:ring-ring'

type ClientRow = {
  id: string
  organizationName: string
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  /** At-cost pricing: this clinic pays our unit cost per vial. */
  paysAtCost?: boolean
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

type Line = {
  variantId: string
  label: string
  quantity: number
  unitPrice: number
  available: number
  /** 'auto' = seeded from SRP/custom; 'manual' = admin edited — don't clobber on clinic change. */
  priceSource: 'auto' | 'manual'
}

export type NewOrderModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called with the new order id after a successful create. */
  onCreated?: (orderId: string) => void
}

export default function NewOrderModal({ open, onOpenChange, onCreated }: NewOrderModalProps) {
  const [clients, setClients] = useState<ClientRow[]>([])
  const [variants, setVariants] = useState<VariantRow[]>([])
  const [loadingRefs, setLoadingRefs] = useState(false)

  const [clientId, setClientId] = useState('')
  const [clientQuery, setClientQuery] = useState('')
  const [creatingClient, setCreatingClient] = useState(false)
  const [newClient, setNewClient] = useState({ organizationName: '', contactName: '', contactEmail: '', contactPhone: '' })
  const [savingClient, setSavingClient] = useState(false)

  const [productQuery, setProductQuery] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  /** variantId → customPrice for the selected clinic (empty when none). */
  const [customPriceMap, setCustomPriceMap] = useState<Record<string, number>>({})

  const [shipTo, setShipTo] = useState<'PRACTICE' | 'PATIENT'>('PRACTICE')
  const [shipSpeed, setShipSpeed] = useState<'TWO_DAY' | 'OVERNIGHT'>('TWO_DAY')
  const [notes, setNotes] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resetAll = useCallback(() => {
    setClientId('')
    setClientQuery('')
    setCreatingClient(false)
    setNewClient({ organizationName: '', contactName: '', contactEmail: '', contactPhone: '' })
    setProductQuery('')
    setLines([])
    setCustomPriceMap({})
    setShipTo('PRACTICE')
    setShipSpeed('TWO_DAY')
    setNotes('')
    setError(null)
  }, [])

  useEffect(() => {
    if (!open) return
    resetAll()
    setLoadingRefs(true)
    Promise.all([
      fetch('/api/admin/clients').then((r) => r.json()).catch(() => ({})),
      fetch('/api/admin/products').then((r) => r.json()).catch(() => ({})),
    ])
      .then(([c, p]) => {
        setClients(c.clients ?? [])
        setVariants(p.variants ?? [])
      })
      .finally(() => setLoadingRefs(false))
  }, [open, resetAll])

  // Load clinic custom prices whenever the selected client changes; re-price auto lines.
  useEffect(() => {
    if (!clientId) {
      setCustomPriceMap({})
      setLines((prev) =>
        prev.map((l) => {
          if (l.priceSource !== 'auto') return l
          const v = variants.find((x) => x.id === l.variantId)
          return v ? { ...l, unitPrice: v.srp } : l
        })
      )
      return
    }
    // At-cost clinics pay unitCost per vial — overrides custom prices and SRP
    // (display-only; the server re-resolves auto lines at submit).
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
        setLines((prev) =>
          prev.map((l) => {
            if (l.priceSource !== 'auto') return l
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
  }, [clientId, variants, clients])

  const selectedClient = clients.find((c) => c.id === clientId) || null

  const filteredClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase()
    const list = q
      ? clients.filter(
          (c) =>
            c.organizationName.toLowerCase().includes(q) ||
            (c.contactName || '').toLowerCase().includes(q) ||
            (c.contactEmail || '').toLowerCase().includes(q)
        )
      : clients
    return list.slice(0, 8)
  }, [clients, clientQuery])

  const filteredVariants = useMemo(() => {
    const q = productQuery.trim().toLowerCase()
    if (!q) return []
    return variants
      .filter(
        (v) =>
          v.productName.toLowerCase().includes(q) ||
          (v.sku || '').toLowerCase().includes(q) ||
          (v.dose || '').toLowerCase().includes(q)
      )
      .slice(0, 8)
  }, [variants, productQuery])

  const clientPaysAtCost = selectedClient?.paysAtCost ?? false
  const resolveUnitPrice = (v: VariantRow) =>
    clientPaysAtCost && v.unitCost > 0 ? v.unitCost : (customPriceMap[v.id] ?? v.srp)

  const addLine = (v: VariantRow) => {
    setLines((prev) => {
      if (prev.some((l) => l.variantId === v.id)) return prev
      return [
        ...prev,
        {
          variantId: v.id,
          label: `${v.productName}${v.dose ? ` ${v.dose}` : ''}${v.sku ? ` · ${v.sku}` : ''}`,
          quantity: 1,
          unitPrice: resolveUnitPrice(v),
          available: v.available,
          priceSource: 'auto',
        },
      ]
    })
    setProductQuery('')
  }

  const updateLine = (variantId: string, patch: Partial<Line>) =>
    setLines((prev) =>
      prev.map((l) => {
        if (l.variantId !== variantId) return l
        const next = { ...l, ...patch }
        if (patch.unitPrice !== undefined) next.priceSource = 'manual'
        return next
      })
    )
  const removeLine = (variantId: string) =>
    setLines((prev) => prev.filter((l) => l.variantId !== variantId))

  const totals = useMemo(
    () => computeCartTotals(lines.map((l) => ({ lineTotal: l.unitPrice * l.quantity })), shipSpeed),
    [lines, shipSpeed]
  )

  const formatPrice = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

  const handleCreateClient = async () => {
    setError(null)
    if (newClient.organizationName.trim().length < 2) {
      setError('Practice / customer name is required')
      return
    }
    setSavingClient(true)
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationName: newClient.organizationName.trim(),
          contactName: newClient.contactName.trim() || undefined,
          contactEmail: newClient.contactEmail.trim() || undefined,
          contactPhone: newClient.contactPhone.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to create client')
      const created: ClientRow = {
        id: data.client.id,
        organizationName: data.client.organizationName,
        contactName: newClient.contactName.trim() || null,
        contactEmail: newClient.contactEmail.trim() || null,
        contactPhone: newClient.contactPhone.trim() || null,
      }
      setClients((prev) => [created, ...prev])
      setClientId(created.id)
      setCreatingClient(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create client')
    } finally {
      setSavingClient(false)
    }
  }

  const canSubmit = !!clientId && lines.length > 0 && !submitting

  const handleSubmit = async () => {
    setError(null)
    if (!clientId) return setError('Select a client')
    if (lines.length === 0) return setError('Add at least one product')
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          shipTo,
          shipSpeed,
          notes: notes.trim() || undefined,
          // Auto-priced lines omit unitPrice so the SERVER resolves the
          // client's current effective price (stale UI or a race before custom
          // prices load can never lock in list price). Only explicit admin
          // edits are sent as overrides.
          lines: lines.map((l) => ({
            variantId: l.variantId,
            quantity: l.quantity,
            ...(l.priceSource === 'manual' ? { unitPrice: l.unitPrice } : {}),
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to create order')
      onCreated?.(data.order.id)
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create order')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            New Order
          </DialogTitle>
          <DialogDescription>
            Build an order from inventory. Line prices use this clinic&apos;s custom pricing when set
            (editable). Take payment after creating, then create a shipping label.
          </DialogDescription>
        </DialogHeader>

        {loadingRefs ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading catalog…
          </div>
        ) : (
          <div className="space-y-6">
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {/* Client */}
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-foreground/90">Customer</legend>
              {selectedClient ? (
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{selectedClient.organizationName}</p>
                    <p className="text-xs text-muted-foreground">
                      {[selectedClient.contactName, selectedClient.contactEmail].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setClientId('')}>Change</Button>
                </div>
              ) : creatingClient ? (
                <div className="space-y-2 rounded-lg border border-border p-3">
                  <Input placeholder="Practice / customer name *" value={newClient.organizationName} onChange={(e) => setNewClient((p) => ({ ...p, organizationName: e.target.value }))} />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input placeholder="Contact name" value={newClient.contactName} onChange={(e) => setNewClient((p) => ({ ...p, contactName: e.target.value }))} />
                    <Input placeholder="Contact email" value={newClient.contactEmail} onChange={(e) => setNewClient((p) => ({ ...p, contactEmail: e.target.value }))} />
                  </div>
                  <Input placeholder="Contact phone" value={newClient.contactPhone} onChange={(e) => setNewClient((p) => ({ ...p, contactPhone: e.target.value }))} />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setCreatingClient(false)} disabled={savingClient}>Cancel</Button>
                    <Button size="sm" onClick={handleCreateClient} disabled={savingClient}>
                      {savingClient ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                      Create & select
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                    <input
                      className={`w-full pl-9 ${inputCls}`}
                      placeholder="Search customers by name or email…"
                      value={clientQuery}
                      onChange={(e) => setClientQuery(e.target.value)}
                    />
                  </div>
                  {clientQuery.trim() && (
                    <div className="max-h-44 overflow-y-auto rounded-lg border border-border">
                      {filteredClients.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-muted-foreground">No matches.</p>
                      ) : (
                        filteredClients.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => { setClientId(c.id); setClientQuery('') }}
                            className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-muted/60"
                          >
                            <span className="text-sm font-medium text-foreground">{c.organizationName}</span>
                            <span className="text-xs text-muted-foreground">{[c.contactName, c.contactEmail].filter(Boolean).join(' · ') || '—'}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setCreatingClient(true)}>
                    <UserPlus className="mr-2 h-4 w-4" /> New customer
                  </Button>
                </div>
              )}
            </fieldset>

            {/* Products */}
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-foreground/90">Products</legend>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                <input
                  className={`w-full pl-9 ${inputCls}`}
                  placeholder="Search products to add…"
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                />
                {filteredVariants.length > 0 && (
                  <div className="absolute z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-lg">
                    {filteredVariants.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => addLine(v)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-muted/60"
                      >
                        <span className="text-sm text-foreground">
                          {v.productName}{v.dose ? ` ${v.dose}` : ''}
                          <span className="ml-1 text-xs text-muted-foreground/70">{v.sku}</span>
                        </span>
                        <span className="flex items-center gap-2 text-xs">
                          <span className={v.available > 0 ? 'text-emerald-400' : 'text-red-500'}>{v.available} avail</span>
                          <span className="font-medium text-foreground/90">{formatPrice(resolveUnitPrice(v))}</span>
                          {clientPaysAtCost && v.unitCost > 0 ? (
                            <span className="rounded bg-amber-500/15 px-1 text-[10px] font-medium text-amber-300">At cost</span>
                          ) : customPriceMap[v.id] != null ? (
                            <span className="rounded bg-emerald-500/15 px-1 text-[10px] font-medium text-emerald-300">Custom</span>
                          ) : null}
                          <Plus className="h-3.5 w-3.5 text-muted-foreground/70" />
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {lines.length > 0 && (
                <div className="divide-y divide-border rounded-lg border border-border">
                  {lines.map((l) => (
                    <div key={l.variantId} className="flex items-center gap-2 p-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-foreground">{l.label}</p>
                        <p className={`text-xs ${l.quantity > l.available ? 'text-amber-400' : 'text-muted-foreground/70'}`}>
                          {l.quantity > l.available ? `Only ${l.available} in stock (oversell)` : `${l.available} available`}
                          {l.priceSource === 'auto'
                            ? clientPaysAtCost
                              ? ' · At-cost price'
                              : customPriceMap[l.variantId] != null
                                ? ' · Custom price'
                                : ''
                            : ''}
                        </p>
                      </div>
                      <input
                        type="number"
                        min={1}
                        value={l.quantity}
                        onChange={(e) => updateLine(l.variantId, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                        className={`w-16 ${inputCls}`}
                        aria-label="Quantity"
                      />
                      <div className="relative">
                        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/70">$</span>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={l.unitPrice}
                          onChange={(e) => updateLine(l.variantId, { unitPrice: Math.max(0, parseFloat(e.target.value) || 0) })}
                          className={`w-24 pl-5 ${inputCls}`}
                          aria-label="Unit price"
                        />
                      </div>
                      <span className="w-20 text-right text-sm font-medium text-foreground/90">{formatPrice(l.unitPrice * l.quantity)}</span>
                      <button type="button" onClick={() => removeLine(l.variantId)} className="text-muted-foreground/70 hover:text-red-500" aria-label="Remove line">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </fieldset>

            {/* Shipping options */}
            <fieldset className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="mb-1 block text-xs font-medium text-muted-foreground">Ship to</Label>
                <select value={shipTo} onChange={(e) => setShipTo(e.target.value as typeof shipTo)} className={`w-full ${selectCls}`}>
                  <option value="PRACTICE">Practice</option>
                  <option value="PATIENT">Patient</option>
                </select>
              </div>
              <div>
                <Label className="mb-1 block text-xs font-medium text-muted-foreground">Ship speed</Label>
                <select value={shipSpeed} onChange={(e) => setShipSpeed(e.target.value as typeof shipSpeed)} className={`w-full ${selectCls}`}>
                  <option value="TWO_DAY">2-Day</option>
                  <option value="OVERNIGHT">Overnight</option>
                </select>
              </div>
            </fieldset>

            <div>
              <Label className="mb-1 block text-xs font-medium text-muted-foreground">Notes (optional)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Order notes…" />
            </div>

            {/* Totals */}
            <div className="space-y-1 rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{formatPrice(totals.subtotal)}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Shipping</span><span>{formatPrice(totals.shippingTotal)}</span></div>
              <div className="flex justify-between border-t border-border pt-1 font-semibold text-foreground"><span>Total</span><span>{formatPrice(totals.total)}</span></div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={!canSubmit}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Create Order
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
