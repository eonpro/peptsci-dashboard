'use client'

import { useEffect, useState } from 'react'
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
import { Loader2, AlertCircle, PackageCheck, Truck, HandHeart } from 'lucide-react'

export type ManualDispositionResult = {
  orderNumber: number
  outcome: 'SHIPPED' | 'DELIVERED'
  trackingNumber: string | null
}

export type ManualDispositionModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: string
  orderNumber?: number
  onDone?: (result: ManualDispositionResult) => void
}

const CARRIERS = ['FedEx', 'UPS', 'USPS', 'DHL', 'Other'] as const

export default function ManualDispositionModal({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  onDone,
}: ManualDispositionModalProps) {
  const [outcome, setOutcome] = useState<'SHIPPED' | 'DELIVERED'>('SHIPPED')
  const [carrier, setCarrier] = useState<string>('FedEx')
  const [tracking, setTracking] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsOverride, setNeedsOverride] = useState(false)

  useEffect(() => {
    if (!open) return
    setOutcome('SHIPPED')
    setCarrier('FedEx')
    setTracking('')
    setNotes('')
    setError(null)
    setNeedsOverride(false)
  }, [open])

  const submit = async (overrideUnpaidShip = false) => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/disposition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outcome,
          carrier: outcome === 'DELIVERED' && !tracking.trim() ? undefined : carrier,
          trackingNumber: tracking.trim() || undefined,
          notes: notes.trim() || undefined,
          overrideUnpaidShip,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data.error === 'PAYMENT_REQUIRED' || res.status === 402) {
          setNeedsOverride(true)
          throw new Error(data.message || 'This order has not been paid.')
        }
        throw new Error(data.message || data.error || 'Failed to disposition order')
      }
      onDone?.({
        orderNumber: data.orderNumber ?? orderNumber ?? 0,
        outcome,
        trackingNumber: data.trackingNumber ?? null,
      })
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to disposition order')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5" /> Manual Disposition{orderNumber ? ` — Order #${orderNumber}` : ''}
          </DialogTitle>
          <DialogDescription>
            For orders fulfilled outside the in-app FedEx flow: shipped with an external label or
            another carrier, hand-delivered, or picked up. Marks the order shipped, draws inventory,
            and notifies the customer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setOutcome('SHIPPED')}
              className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-sm transition-colors ${
                outcome === 'SHIPPED'
                  ? 'border-[#2b2c84] bg-[#2b2c84]/5 font-medium'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              <Truck className="h-5 w-5" />
              Shipped
              <span className="text-xs font-normal text-gray-400">External carrier / label</span>
            </button>
            <button
              type="button"
              onClick={() => setOutcome('DELIVERED')}
              className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-sm transition-colors ${
                outcome === 'DELIVERED'
                  ? 'border-[#2b2c84] bg-[#2b2c84]/5 font-medium'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              <HandHeart className="h-5 w-5" />
              Delivered
              <span className="text-xs font-normal text-gray-400">Hand-delivered / pickup</span>
            </button>
          </div>

          <div className="space-y-2">
            <Label>Carrier</Label>
            <div className="flex flex-wrap gap-2">
              {CARRIERS.map((c) => (
                <Button
                  key={c}
                  type="button"
                  size="sm"
                  variant={carrier === c ? 'default' : 'outline'}
                  onClick={() => setCarrier(c)}
                >
                  {c}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="manual-tracking">
              Tracking number {outcome === 'DELIVERED' ? '(optional)' : '(recommended)'}
            </Label>
            <Input
              id="manual-tracking"
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              placeholder="e.g. 1Z999AA10123456784"
              autoComplete="off"
            />
            {!tracking.trim() && outcome === 'SHIPPED' && (
              <p className="text-xs text-amber-600">
                Without a tracking number the customer gets no tracking link.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="manual-notes">Notes (optional)</Label>
            <Input
              id="manual-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Customer picked up at office"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {needsOverride ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-amber-700">
                This order is unpaid and not invoiced. Disposition anyway? The override is
                audit-logged.
              </p>
              <div className="flex gap-2">
                <Button
                  className="flex-1 bg-amber-600 text-white hover:bg-amber-700"
                  disabled={submitting}
                  onClick={() => void submit(true)}
                >
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Disposition anyway
                </Button>
                <Button variant="outline" disabled={submitting} onClick={() => setNeedsOverride(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button className="w-full" disabled={submitting} onClick={() => void submit(false)}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
                </>
              ) : outcome === 'DELIVERED' ? (
                'Mark Delivered'
              ) : (
                'Mark Shipped'
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
