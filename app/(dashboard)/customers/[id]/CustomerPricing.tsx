'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DollarSign, Plus, Trash2, Percent, Tag, Loader2, AlertCircle } from 'lucide-react'

interface CustomerPricingProps {
  customerId: string
  customerName: string
  customerEmail?: string | null
}

interface ClientRecord {
  id: string
  organizationName: string
  contactName: string | null
  contactEmail: string | null
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
  variantId: string
  variantSku: string | null
  productName: string
  dose: string | null
  standardPrice: number
  customPrice: number
  discountPercent: number | null
  notes: string | null
}

export function CustomerPricing({ customerId, customerName, customerEmail }: CustomerPricingProps) {
  const [client, setClient] = useState<ClientRecord | null>(null)
  const [variants, setVariants] = useState<VariantOption[]>([])
  const [customPrices, setCustomPrices] = useState<ClientPricingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [newPricing, setNewPricing] = useState({
    variantId: '',
    customPrice: '',
    notes: '',
  })

  const loadPricing = useCallback(async (clientId: string) => {
    const res = await fetch(`/api/admin/client-pricing?clientId=${encodeURIComponent(clientId)}`)
    if (!res.ok) throw new Error('Failed to load custom pricing')
    const data = await res.json()
    setCustomPrices(Array.isArray(data) ? data : (data.prices ?? []))
  }, [])

  // Resolve the sales customer to a Client record (the URL id is an email or
  // name slug from the sales sheet, not a Client id), load the real product
  // catalog, then load any existing custom pricing for that client.
  useEffect(() => {
    let active = true
    async function loadAll() {
      setLoading(true)
      setError(null)
      try {
        const [cRes, vRes] = await Promise.all([
          fetch('/api/admin/clients'),
          fetch('/api/admin/products'),
        ])
        if (!cRes.ok || !vRes.ok) throw new Error('Failed to load pricing data')
        const cData = await cRes.json()
        const vData = await vRes.json()
        if (!active) return

        setVariants(vData.variants ?? [])

        const clients: ClientRecord[] = cData.clients ?? []
        const idLower = customerId.toLowerCase()
        const emailLower = customerEmail?.toLowerCase() ?? ''
        const nameLower = customerName.toLowerCase()
        const match =
          clients.find((c) => c.id === customerId) ??
          clients.find((c) => c.contactEmail?.toLowerCase() === idLower) ??
          (emailLower
            ? clients.find((c) => c.contactEmail?.toLowerCase() === emailLower)
            : undefined) ??
          clients.find(
            (c) =>
              c.organizationName.toLowerCase() === nameLower ||
              c.contactName?.toLowerCase() === nameLower
          ) ??
          null

        setClient(match)
        if (match) {
          await loadPricing(match.id)
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load pricing data')
      } finally {
        if (active) setLoading(false)
      }
    }
    loadAll()
    return () => {
      active = false
    }
  }, [customerId, customerName, customerEmail, loadPricing])

  const selectedVariant = variants.find((v) => v.id === newPricing.variantId)
  const availableVariants = variants.filter(
    (v) => !customPrices.some((cp) => cp.variantId === v.id)
  )

  const variantLabel = (v: { productName: string; dose: string | null }) =>
    `${v.productName}${v.dose ? ` ${v.dose}` : ''}`

  const handleAddPricing = async () => {
    if (!client || !selectedVariant || !newPricing.customPrice) return
    const customPrice = parseFloat(newPricing.customPrice)
    if (!Number.isFinite(customPrice) || customPrice <= 0) {
      setError('Enter a valid custom price greater than zero')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/client-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.id,
          variantId: selectedVariant.id,
          customPrice,
          notes: newPricing.notes.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message || body.error || 'Failed to save pricing')
      }
      setNewPricing({ variantId: '', customPrice: '', notes: '' })
      setIsAddDialogOpen(false)
      await loadPricing(client.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save pricing')
    } finally {
      setSaving(false)
    }
  }

  const handleRemovePricing = async (id: string) => {
    if (!client) return
    setError(null)
    const prev = customPrices
    setCustomPrices((p) => p.filter((cp) => cp.id !== id)) // optimistic
    try {
      const res = await fetch(`/api/admin/client-pricing?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message || body.error || 'Failed to remove pricing')
      }
    } catch (e) {
      setCustomPrices(prev) // rollback
      setError(e instanceof Error ? e.message : 'Failed to remove pricing')
    }
  }

  const discountPreview =
    selectedVariant && newPricing.customPrice && selectedVariant.srp > 0
      ? ((selectedVariant.srp - parseFloat(newPricing.customPrice)) / selectedVariant.srp) * 100
      : null

  return (
    <Card className="rounded-2xl bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Tag className="h-5 w-5" />
              Custom Pricing
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Set special prices for {customerName}
            </CardDescription>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button
                className="bg-brand-primary hover:bg-[#1a30c0] text-white"
                disabled={loading || !client}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Custom Price
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border text-foreground sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle className="text-foreground">Add Custom Pricing</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Set a special price for {customerName}. This will override the standard retail
                  price when they order.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Product</Label>
                  <Select
                    value={newPricing.variantId}
                    onValueChange={(value) => setNewPricing({ ...newPricing, variantId: value })}
                  >
                    <SelectTrigger className="bg-background border-input text-foreground">
                      <SelectValue placeholder="Select a product" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border max-h-[300px]">
                      {availableVariants.length === 0 ? (
                        <SelectItem value="none" disabled className="text-muted-foreground">
                          All products have custom pricing
                        </SelectItem>
                      ) : (
                        availableVariants.map((variant) => (
                          <SelectItem
                            key={variant.id}
                            value={variant.id}
                            className="text-foreground focus:bg-accent focus:text-accent-foreground"
                          >
                            <div className="flex justify-between items-center w-full">
                              <span>{variantLabel(variant)}</span>
                              <span className="text-muted-foreground ml-2">
                                ${variant.srp.toFixed(2)}
                              </span>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {selectedVariant && (
                    <p className="text-sm text-muted-foreground">
                      Standard price: ${selectedVariant.srp.toFixed(2)}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-muted-foreground">Custom Price</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={newPricing.customPrice}
                      onChange={(e) =>
                        setNewPricing({ ...newPricing, customPrice: e.target.value })
                      }
                      className="pl-9 bg-background border-input text-foreground"
                    />
                  </div>
                  {discountPreview !== null && Number.isFinite(discountPreview) && (
                    <p className="text-sm text-green-400">
                      <Percent className="inline h-3 w-3 mr-1" />
                      {discountPreview.toFixed(1)}% discount from standard price
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-muted-foreground">Notes (optional)</Label>
                  <Input
                    placeholder="e.g., Volume discount, Partner pricing..."
                    value={newPricing.notes}
                    onChange={(e) => setNewPricing({ ...newPricing, notes: e.target.value })}
                    className="bg-background border-input text-foreground placeholder:text-muted-foreground"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsAddDialogOpen(false)}
                  className="border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddPricing}
                  disabled={!newPricing.variantId || !newPricing.customPrice || saving}
                  className="bg-brand-primary hover:bg-[#1a30c0] text-white"
                >
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Add Pricing
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading pricing…
          </div>
        ) : !client ? (
          <div className="text-center py-8">
            <div className="bg-muted/20 p-4 rounded-full w-fit mx-auto mb-4">
              <AlertCircle className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">Custom pricing not available</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              {customerName} isn&apos;t linked to a client account yet, so custom pricing can&apos;t
              be set here.
            </p>
          </div>
        ) : customPrices.length === 0 ? (
          <div className="text-center py-8">
            <div className="bg-muted/20 p-4 rounded-full w-fit mx-auto mb-4">
              <Tag className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">No custom pricing set</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              {customerName} will see standard prices
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Product</TableHead>
                <TableHead className="text-muted-foreground">SKU</TableHead>
                <TableHead className="text-muted-foreground text-right">Standard</TableHead>
                <TableHead className="text-muted-foreground text-right">Custom Price</TableHead>
                <TableHead className="text-muted-foreground text-right">Discount</TableHead>
                <TableHead className="text-muted-foreground">Notes</TableHead>
                <TableHead className="text-muted-foreground text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customPrices.map((item) => (
                <TableRow key={item.id} className="border-border hover:bg-muted/10">
                  <TableCell className="font-medium text-foreground">
                    {variantLabel(item)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{item.variantSku || '-'}</TableCell>
                  <TableCell className="text-muted-foreground text-right line-through">
                    ${item.standardPrice.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-green-400 text-right font-semibold">
                    ${item.customPrice.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary" className="bg-green-500/10 text-green-400 border-0">
                      {item.discountPercent != null
                        ? `-${item.discountPercent.toFixed(1)}%`
                        : '—'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-[150px] truncate">
                    {item.notes || '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                      onClick={() => handleRemovePricing(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
