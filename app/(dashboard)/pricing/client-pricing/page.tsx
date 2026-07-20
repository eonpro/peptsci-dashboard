'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { apiError } from '@/lib/api-error'
import {
  ArrowLeft,
  Plus,
  Trash2,
  Edit2,
  Users,
  DollarSign,
  Percent,
  Search,
  AlertCircle,
  Loader2,
} from 'lucide-react'

interface ClientOption {
  id: string
  organizationName: string
}

interface VariantOption {
  id: string
  sku: string | null
  productName: string
  dose: string | null
  srp: number
}

interface ClientPricingRow {
  id: string
  clientId: string
  clientName: string
  variantId: string
  variantSku: string | null
  productName: string
  dose: string | null
  standardPrice: number
  customPrice: number
  discountPercent: number | null
  notes: string | null
  isActive: boolean
}

const inputClass = 'bg-[#0a0e3a] border-white/10 text-white'

export default function ClientPricingPage() {
  const [pricing, setPricing] = useState<ClientPricingRow[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [variants, setVariants] = useState<VariantOption[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedClientFilter, setSelectedClientFilter] = useState<string>('all')

  const [form, setForm] = useState({ clientId: '', variantId: '', customPrice: '', notes: '' })

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [pRes, cRes, vRes] = await Promise.all([
        fetch('/api/admin/client-pricing'),
        fetch('/api/admin/clients'),
        fetch('/api/admin/products'),
      ])

      if (!pRes.ok) throw await apiError(pRes, 'Failed to load client pricing')
      if (!cRes.ok) throw await apiError(cRes, 'Failed to load clients')
      if (!vRes.ok) throw await apiError(vRes, 'Failed to load products')

      const pData = await pRes.json()
      const cData = await cRes.json()
      const vData = await vRes.json()

      setPricing(Array.isArray(pData) ? pData : (pData.prices ?? []))
      setClients(cData.clients ?? [])
      setVariants(vData.variants ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const filteredPricing = useMemo(
    () =>
      pricing.filter((cp) => {
        const term = searchTerm.toLowerCase()
        const matchesSearch =
          cp.clientName.toLowerCase().includes(term) ||
          cp.productName.toLowerCase().includes(term) ||
          (cp.variantSku || '').toLowerCase().includes(term)
        const matchesClient =
          selectedClientFilter === 'all' || cp.clientId === selectedClientFilter
        return matchesSearch && matchesClient
      }),
    [pricing, searchTerm, selectedClientFilter]
  )

  const pricingByClient = useMemo(
    () =>
      filteredPricing.reduce(
        (acc, cp) => {
          if (!acc[cp.clientId]) acc[cp.clientId] = { clientName: cp.clientName, items: [] }
          acc[cp.clientId].items.push(cp)
          return acc
        },
        {} as Record<string, { clientName: string; items: ClientPricingRow[] }>
      ),
    [filteredPricing]
  )

  const avgDiscount = useMemo(() => {
    const withDiscount = pricing.filter((p) => typeof p.discountPercent === 'number')
    if (withDiscount.length === 0) return 0
    return (
      withDiscount.reduce((sum, p) => sum + (p.discountPercent || 0), 0) / withDiscount.length
    )
  }, [pricing])

  const selectedVariant = variants.find((v) => v.id === form.variantId)

  function openAdd() {
    setEditingId(null)
    setForm({ clientId: '', variantId: '', customPrice: '', notes: '' })
    setIsDialogOpen(true)
  }

  function openEdit(row: ClientPricingRow) {
    setEditingId(row.id)
    setForm({
      clientId: row.clientId,
      variantId: row.variantId,
      customPrice: String(row.customPrice),
      notes: row.notes || '',
    })
    setIsDialogOpen(true)
  }

  async function handleSave() {
    if (!form.clientId || !form.variantId || !form.customPrice) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/client-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: form.clientId,
          variantId: form.variantId,
          customPrice: parseFloat(form.customPrice),
          notes: form.notes || undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message || 'Failed to save pricing')
      }
      setIsDialogOpen(false)
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save pricing')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setError(null)
    // Optimistic removal
    const prev = pricing
    setPricing((p) => p.filter((x) => x.id !== id))
    try {
      const res = await fetch(`/api/admin/client-pricing?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw await apiError(res, 'Failed to delete pricing')
    } catch (e) {
      setPricing(prev) // rollback
      setError(e instanceof Error ? e.message : 'Failed to delete pricing')
    }
  }

  const discountPreview =
    selectedVariant && form.customPrice
      ? ((selectedVariant.srp - parseFloat(form.customPrice)) / selectedVariant.srp) * 100
      : null

  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href="/pricing">
            <Button
              variant="ghost"
              size="icon"
              className="text-white/70 hover:text-white hover:bg-white/10"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Client Custom Pricing</h1>
            <p className="text-white/60 text-sm">Set special pricing for specific clients</p>
          </div>
        </div>

        <Button onClick={openAdd} className="bg-brand-primary hover:bg-[#1a30c0] text-white">
          <Plus className="h-4 w-4 mr-2" />
          Add Custom Price
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-[#0a0e3a]/50 border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/60">
              Clients with Custom Pricing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-brand-primary" />
              <span className="text-2xl font-bold text-white">
                {new Set(pricing.map((p) => p.clientId)).size}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#0a0e3a]/50 border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/60">Total Custom Prices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-400" />
              <span className="text-2xl font-bold text-white">{pricing.length}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#0a0e3a]/50 border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/60">Average Discount</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Percent className="h-5 w-5 text-amber-400" />
              <span className="text-2xl font-bold text-white">{avgDiscount.toFixed(1)}%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input
            placeholder="Search by client or product..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 bg-[#0a0e3a] border-white/10 text-white placeholder:text-white/40"
          />
        </div>

        <Select value={selectedClientFilter} onValueChange={setSelectedClientFilter}>
          <SelectTrigger className="w-[200px] bg-[#0a0e3a] border-white/10 text-white">
            <SelectValue placeholder="Filter by client" />
          </SelectTrigger>
          <SelectContent className="bg-brand-onyx border-white/10">
            <SelectItem value="all" className="text-white focus:bg-white/10 focus:text-white">
              All Clients
            </SelectItem>
            {clients.map((client) => (
              <SelectItem
                key={client.id}
                value={client.id}
                className="text-white focus:bg-white/10 focus:text-white"
              >
                {client.organizationName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-white/60">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading pricing...
        </div>
      ) : Object.keys(pricingByClient).length > 0 ? (
        <div className="space-y-6">
          {Object.entries(pricingByClient).map(([clientId, { clientName, items }]) => (
            <Card key={clientId} className="bg-[#0a0e3a]/50 border-white/10 overflow-hidden">
              <CardHeader className="bg-brand-onyx/50 border-b border-white/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-brand-primary/20 p-2 rounded-lg">
                      <Users className="h-5 w-5 text-brand-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-white">{clientName}</CardTitle>
                      <CardDescription className="text-white/50">
                        {items.length} custom price{items.length !== 1 ? 's' : ''}
                      </CardDescription>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-green-500/30 text-green-400 bg-green-500/10"
                  >
                    Active
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10 hover:bg-transparent">
                      <TableHead className="text-white/60">Product</TableHead>
                      <TableHead className="text-white/60">SKU</TableHead>
                      <TableHead className="text-white/60 text-right">Standard Price</TableHead>
                      <TableHead className="text-white/60 text-right">Custom Price</TableHead>
                      <TableHead className="text-white/60 text-right">Discount</TableHead>
                      <TableHead className="text-white/60">Notes</TableHead>
                      <TableHead className="text-white/60 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id} className="border-white/5 hover:bg-white/5">
                        <TableCell className="text-white font-medium">
                          {item.productName}
                          {item.dose ? ` ${item.dose}` : ''}
                        </TableCell>
                        <TableCell className="text-white/60">{item.variantSku || '-'}</TableCell>
                        <TableCell className="text-white/60 text-right line-through">
                          ${item.standardPrice.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-green-400 text-right font-semibold">
                          ${item.customPrice.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant="secondary"
                            className="bg-green-500/10 text-green-400 border-0"
                          >
                            {item.discountPercent != null
                              ? `-${item.discountPercent.toFixed(1)}%`
                              : '—'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-white/50 text-sm max-w-[200px] truncate">
                          {item.notes || '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-white/50 hover:text-white hover:bg-white/10"
                              onClick={() => openEdit(item)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                              onClick={() => handleDelete(item.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="bg-[#0a0e3a]/50 border-white/10">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="bg-white/5 p-4 rounded-full mb-4">
              <AlertCircle className="h-8 w-8 text-white/40" />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">No Custom Pricing Found</h3>
            <p className="text-white/50 text-center max-w-md mb-6">
              {searchTerm || selectedClientFilter !== 'all'
                ? 'No pricing matches your current filters. Try adjusting your search criteria.'
                : "You haven't set up any custom pricing yet. Click the button above to create special pricing for your clients."}
            </p>
            {!searchTerm && selectedClientFilter === 'all' && (
              <Button onClick={openAdd} className="bg-brand-primary hover:bg-[#1a30c0] text-white">
                <Plus className="h-4 w-4 mr-2" />
                Add First Custom Price
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-brand-onyx border-white/10 text-white sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editingId ? 'Edit Custom Pricing' : 'Add Custom Pricing'}
            </DialogTitle>
            <DialogDescription className="text-white/60">
              Set a special price for a specific client. This price overrides the standard retail
              price wherever that client shops.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-white/80">Client</Label>
              <Select
                value={form.clientId}
                onValueChange={(value) => setForm({ ...form, clientId: value })}
                disabled={!!editingId}
              >
                <SelectTrigger className={inputClass}>
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent className="bg-brand-onyx border-white/10">
                  {clients.map((client) => (
                    <SelectItem
                      key={client.id}
                      value={client.id}
                      className="text-white focus:bg-white/10 focus:text-white"
                    >
                      {client.organizationName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-white/80">Product</Label>
              <Select
                value={form.variantId}
                onValueChange={(value) => setForm({ ...form, variantId: value })}
                disabled={!!editingId}
              >
                <SelectTrigger className={inputClass}>
                  <SelectValue placeholder="Select a product" />
                </SelectTrigger>
                <SelectContent className="bg-brand-onyx border-white/10 max-h-[300px]">
                  {variants.map((v) => (
                    <SelectItem
                      key={v.id}
                      value={v.id}
                      className="text-white focus:bg-white/10 focus:text-white"
                    >
                      {v.productName}
                      {v.dose ? ` ${v.dose}` : ''} — ${v.srp.toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedVariant && (
                <p className="text-sm text-white/50">
                  Standard price: ${selectedVariant.srp.toFixed(2)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-white/80">Custom Price</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={form.customPrice}
                  onChange={(e) => setForm({ ...form, customPrice: e.target.value })}
                  className={`pl-9 ${inputClass}`}
                />
              </div>
              {discountPreview !== null && (
                <p className="text-sm text-green-400">
                  <Percent className="inline h-3 w-3 mr-1" />
                  {discountPreview.toFixed(1)}% discount
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-white/80">Notes (optional)</Label>
              <Input
                placeholder="e.g., Volume discount, Partner pricing..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              className="border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!form.clientId || !form.variantId || !form.customPrice || saving}
              className="bg-brand-primary hover:bg-[#1a30c0] text-white"
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingId ? 'Save Changes' : 'Add Pricing'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
