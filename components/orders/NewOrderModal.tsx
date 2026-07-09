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

const ACCENT = '#2b2c84'
const inputCls =
  'rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#2b2c84] focus:outline-hidden focus:ring-1 focus:ring-[#2b2c84]'

type ClientRow = {
  id: string
  organizationName: string
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
}

type VariantRow = {
  id: string
  sku: string | null
  productName: string
  dose: string | null
  srp: number
  available: number
}

type Line = {
  variantId: string
  label: string
  quantity: number
  unitPrice: number
  available: number
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

  const addLine = (v: VariantRow) => {
    setLines((prev) => {
      if (prev.some((l) => l.variantId === v.id)) return prev
      return [
        ...prev,
        {
          variantId: v.id,
          label: `${v.productName}${v.dose ? ` ${v.dose}` : ''}${v.sku ? ` · ${v.sku}` : ''}`,
          quantity: 1,
          unitPrice: v.srp,
          available: v.available,
        },
      ]
    })
    setProductQuery('')
  }

  const updateLine = (variantId: string, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.variantId === variantId ? { ...l, ...patch } : l)))
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
          lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitPrice: l.unitPrice })),
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
            <ShoppingCart className="h-5 w-5" style={{ color: ACCENT }} />
            New Order
          </DialogTitle>
          <DialogDescription>
            Build an order from inventory. Prices are set from the catalog (editable). Take payment after
            creating, then create a shipping label.
          </DialogDescription>
        </DialogHeader>

        {loadingRefs ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading catalog…
          </div>
        ) : (
          <div className="space-y-6">
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Client */}
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-gray-700">Customer</legend>
              {selectedClient ? (
                <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{selectedClient.organizationName}</p>
                    <p className="text-xs text-gray-500">
                      {[selectedClient.contactName, selectedClient.contactEmail].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setClientId('')}>Change</Button>
                </div>
              ) : creatingClient ? (
                <div className="space-y-2 rounded-lg border border-gray-200 p-3">
                  <Input placeholder="Practice / customer name *" value={newClient.organizationName} onChange={(e) => setNewClient((p) => ({ ...p, organizationName: e.target.value }))} />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input placeholder="Contact name" value={newClient.contactName} onChange={(e) => setNewClient((p) => ({ ...p, contactName: e.target.value }))} />
                    <Input placeholder="Contact email" value={newClient.contactEmail} onChange={(e) => setNewClient((p) => ({ ...p, contactEmail: e.target.value }))} />
                  </div>
                  <Input placeholder="Contact phone" value={newClient.contactPhone} onChange={(e) => setNewClient((p) => ({ ...p, contactPhone: e.target.value }))} />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setCreatingClient(false)} disabled={savingClient}>Cancel</Button>
                    <Button size="sm" onClick={handleCreateClient} disabled={savingClient} style={{ backgroundColor: ACCENT }}>
                      {savingClient ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                      Create & select
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      className={`w-full pl-9 ${inputCls}`}
                      placeholder="Search customers by name or email…"
                      value={clientQuery}
                      onChange={(e) => setClientQuery(e.target.value)}
                    />
                  </div>
                  {clientQuery.trim() && (
                    <div className="max-h-44 overflow-y-auto rounded-lg border border-gray-200">
                      {filteredClients.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-gray-500">No matches.</p>
                      ) : (
                        filteredClients.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => { setClientId(c.id); setClientQuery('') }}
                            className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-gray-50"
                          >
                            <span className="text-sm font-medium text-gray-800">{c.organizationName}</span>
                            <span className="text-xs text-gray-500">{[c.contactName, c.contactEmail].filter(Boolean).join(' · ') || '—'}</span>
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
              <legend className="text-sm font-semibold text-gray-700">Products</legend>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  className={`w-full pl-9 ${inputCls}`}
                  placeholder="Search products to add…"
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                />
                {filteredVariants.length > 0 && (
                  <div className="absolute z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                    {filteredVariants.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => addLine(v)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-gray-50"
                      >
                        <span className="text-sm text-gray-800">
                          {v.productName}{v.dose ? ` ${v.dose}` : ''}
                          <span className="ml-1 text-xs text-gray-400">{v.sku}</span>
                        </span>
                        <span className="flex items-center gap-2 text-xs">
                          <span className={v.available > 0 ? 'text-emerald-600' : 'text-red-500'}>{v.available} avail</span>
                          <span className="font-medium text-gray-700">{formatPrice(v.srp)}</span>
                          <Plus className="h-3.5 w-3.5 text-gray-400" />
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {lines.length > 0 && (
                <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                  {lines.map((l) => (
                    <div key={l.variantId} className="flex items-center gap-2 p-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-gray-800">{l.label}</p>
                        <p className={`text-xs ${l.quantity > l.available ? 'text-amber-600' : 'text-gray-400'}`}>
                          {l.quantity > l.available ? `Only ${l.available} in stock (oversell)` : `${l.available} available`}
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
                        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
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
                      <span className="w-20 text-right text-sm font-medium text-gray-700">{formatPrice(l.unitPrice * l.quantity)}</span>
                      <button type="button" onClick={() => removeLine(l.variantId)} className="text-gray-400 hover:text-red-500" aria-label="Remove line">
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
                <Label className="mb-1 block text-xs font-medium text-gray-500">Ship to</Label>
                <select value={shipTo} onChange={(e) => setShipTo(e.target.value as typeof shipTo)} className={`w-full ${inputCls}`}>
                  <option value="PRACTICE">Practice</option>
                  <option value="PATIENT">Patient</option>
                </select>
              </div>
              <div>
                <Label className="mb-1 block text-xs font-medium text-gray-500">Ship speed</Label>
                <select value={shipSpeed} onChange={(e) => setShipSpeed(e.target.value as typeof shipSpeed)} className={`w-full ${inputCls}`}>
                  <option value="TWO_DAY">2-Day</option>
                  <option value="OVERNIGHT">Overnight</option>
                </select>
              </div>
            </fieldset>

            <div>
              <Label className="mb-1 block text-xs font-medium text-gray-500">Notes (optional)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Order notes…" />
            </div>

            {/* Totals */}
            <div className="space-y-1 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
              <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatPrice(totals.subtotal)}</span></div>
              <div className="flex justify-between text-gray-600"><span>Shipping</span><span>{formatPrice(totals.shippingTotal)}</span></div>
              <div className="flex justify-between border-t border-gray-200 pt-1 font-semibold text-gray-900"><span>Total</span><span>{formatPrice(totals.total)}</span></div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={!canSubmit} style={{ backgroundColor: ACCENT }}>
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
