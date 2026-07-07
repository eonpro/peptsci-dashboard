'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'

interface FormState {
  customerName: string
  customerEmail: string
  customerPhone: string
  address: string
  city: string
  state: string
  zip: string
  date: string
  orderRef: string
  product: string
  vials: string
  amountPerVial: string
  paidAmount: string
  invoicePaid: boolean
  notes: string
}

const EMPTY: FormState = {
  customerName: '',
  customerEmail: '',
  customerPhone: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  date: '',
  orderRef: '',
  product: '',
  vials: '',
  amountPerVial: '',
  paidAmount: '',
  invoicePaid: true,
  notes: '',
}

function toNumber(raw: string): number | undefined {
  const cleaned = raw.replace(/[$,\s]/g, '').trim()
  if (cleaned === '') return undefined
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : undefined
}

/**
 * "Add Customer" — creates a manual sales record. Customer contact info alone
 * is enough (a $0 record makes the customer appear); sale details are optional.
 */
export default function AddCustomerButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  function openDialog() {
    setValues({ ...EMPTY, date: new Date().toISOString().slice(0, 10) })
    setError(null)
    setOpen(true)
  }

  async function save() {
    setError(null)
    if (!values.customerName.trim() && !values.customerEmail.trim() && !values.customerPhone.trim()) {
      setError('Enter at least a name, email, or phone')
      return
    }
    const vials = toNumber(values.vials)
    const amountPerVial = toNumber(values.amountPerVial)
    const paidAmount = toNumber(values.paidAmount)
    for (const [label, raw, parsed] of [
      ['Vials', values.vials, vials],
      ['Price per vial', values.amountPerVial, amountPerVial],
      ['Total paid', values.paidAmount, paidAmount],
    ] as const) {
      if (raw.trim() !== '' && (parsed === undefined || parsed < 0)) {
        setError(`${label} must be a non-negative number`)
        return
      }
    }

    // A contact-only entry (no sale figures) is stored without a date so it
    // doesn't count as an order in the customer metrics.
    const hasSale =
      Boolean(values.product.trim() || values.orderRef.trim()) ||
      vials !== undefined ||
      amountPerVial !== undefined ||
      paidAmount !== undefined

    setSaving(true)
    try {
      const res = await fetch('/api/admin/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: values.customerName,
          customerEmail: values.customerEmail,
          customerPhone: values.customerPhone,
          address: values.address,
          city: values.city,
          state: values.state,
          zip: values.zip,
          date: hasSale ? values.date : '',
          orderRef: values.orderRef,
          product: values.product,
          ...(vials !== undefined ? { vials: Math.trunc(vials) } : {}),
          ...(amountPerVial !== undefined ? { amountPerVial } : {}),
          ...(paidAmount !== undefined ? { paidAmount } : {}),
          invoicePaid: values.invoicePaid,
          notes: values.notes,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.message || 'Failed to add customer')
      }
      toast.success('Customer added')
      setOpen(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add customer')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button onClick={openDialog} className="bg-brand-primary hover:bg-[#1a30c0] text-white">
        <UserPlus className="h-4 w-4 mr-2" />
        Add Customer
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Customer</DialogTitle>
            <DialogDescription>
              Add a customer with contact info alone, or include their sale so it counts toward
              revenue and P&amp;L. Customers from shop orders, CSV imports, and Stripe backfills
              appear here automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <p className="text-sm font-medium text-muted-foreground">Contact</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Name</Label>
                <Input
                  placeholder="Dr. Jane Smith"
                  value={values.customerName}
                  onChange={(e) => set('customerName', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input
                  type="email"
                  placeholder="jane@clinic.com"
                  value={values.customerEmail}
                  onChange={(e) => set('customerEmail', e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Phone</Label>
                <Input
                  placeholder="555-123-4567"
                  value={values.customerPhone}
                  onChange={(e) => set('customerPhone', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Address</Label>
                <Input
                  placeholder="123 Main St"
                  value={values.address}
                  onChange={(e) => set('address', e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">City</Label>
                <Input value={values.city} onChange={(e) => set('city', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">State</Label>
                <Input placeholder="TX" value={values.state} onChange={(e) => set('state', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">ZIP</Label>
                <Input value={values.zip} onChange={(e) => set('zip', e.target.value)} />
              </div>
            </div>

            <p className="text-sm font-medium text-muted-foreground pt-2">
              Sale details <span className="font-normal">(optional)</span>
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Date</Label>
                <Input type="date" value={values.date} onChange={(e) => set('date', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Order ref</Label>
                <Input
                  placeholder="P-0115-001"
                  value={values.orderRef}
                  onChange={(e) => set('orderRef', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Product</Label>
                <Input
                  placeholder="Tirzepatide 60mg"
                  value={values.product}
                  onChange={(e) => set('product', e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Vials / units</Label>
                <Input
                  inputMode="numeric"
                  placeholder="2"
                  value={values.vials}
                  onChange={(e) => set('vials', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Price per vial $</Label>
                <Input
                  inputMode="decimal"
                  placeholder="449.50"
                  value={values.amountPerVial}
                  onChange={(e) => set('amountPerVial', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Total paid $</Label>
                <Input
                  inputMode="decimal"
                  placeholder="899.00"
                  value={values.paidAmount}
                  onChange={(e) => set('paidAmount', e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="invoice-paid"
                checked={values.invoicePaid}
                onCheckedChange={(v) => set('invoicePaid', v === true)}
              />
              <Label htmlFor="invoice-paid" className="text-sm">
                Invoice paid
              </Label>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea
                rows={2}
                value={values.notes}
                onChange={(e) => set('notes', e.target.value)}
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
                {error}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
