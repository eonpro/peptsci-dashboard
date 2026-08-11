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
import { Loader2, CheckCircle2, AlertCircle, XCircle } from 'lucide-react'

const REASONS = [
  { id: 'wrong_compound', label: 'Wrong compound' },
  { id: 'client_cancelled', label: 'Client cancelled' },
  { id: 'duplicate', label: 'Duplicate' },
  { id: 'address_issue', label: 'Address issue' },
  { id: 'other', label: 'Other' },
] as const

type ReasonId = (typeof REASONS)[number]['id']

export type CancelOrderModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: string
  orderNumber?: number
  onCancelled?: () => void
}

export default function CancelOrderModal({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  onCancelled,
}: CancelOrderModalProps) {
  const [reason, setReason] = useState<ReasonId>('client_cancelled')
  const [notes, setNotes] = useState('')
  const [alsoRefund, setAlsoRefund] = useState(true)
  const [hasStripePayment, setHasStripePayment] = useState(false)
  const [loadingInfo, setLoadingInfo] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ refunded: boolean; refundAmount: number | null } | null>(null)

  useEffect(() => {
    if (!open) return
    setReason('client_cancelled')
    setNotes('')
    setConfirming(false)
    setError(null)
    setDone(null)
    setLoadingInfo(true)
    fetch(`/api/admin/orders/${orderId}/refund`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) return { hasStripePayment: false }
        return data as { hasStripePayment?: boolean }
      })
      .then((data) => {
        const paid = Boolean(data.hasStripePayment)
        setHasStripePayment(paid)
        setAlsoRefund(paid)
      })
      .catch(() => {
        setHasStripePayment(false)
        setAlsoRefund(false)
      })
      .finally(() => setLoadingInfo(false))
  }, [open, orderId])

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason,
          notes: notes.trim() || undefined,
          refund: hasStripePayment ? alsoRefund : false,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || data.error || 'Cancel failed')
      setDone({
        refunded: Boolean(data.refunded),
        refundAmount: typeof data.refundAmount === 'number' ? data.refundAmount : null,
      })
      onCancelled?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cancel failed')
      setConfirming(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-400" /> Cancel fulfillment
            {orderNumber ? ` — Order #${orderNumber}` : ''}
          </DialogTitle>
          <DialogDescription>
            Stops picking/packing, releases reserved stock, and removes this order from the
            fulfillment queue. Only available before the order ships.
          </DialogDescription>
        </DialogHeader>

        {loadingInfo ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : done ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-400" />
            <p className="font-medium">Order cancelled</p>
            <p className="text-sm text-muted-foreground">
              {done.refunded && done.refundAmount != null
                ? `Full refund of $${done.refundAmount.toFixed(2)} issued to the original payment.`
                : 'Reserved stock released. No refund was issued.'}
            </p>
            <Button className="mt-2" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cancel-reason">Reason</Label>
              <select
                id="cancel-reason"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value as ReasonId)
                  setConfirming(false)
                }}
              >
                {REASONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cancel-notes">Notes (optional)</Label>
              <Input
                id="cancel-notes"
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value)
                  setConfirming(false)
                }}
                placeholder="e.g. Client called, needs different dose"
                maxLength={1000}
              />
            </div>

            {hasStripePayment && (
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-brand-primary"
                  checked={alsoRefund}
                  onChange={(e) => {
                    setAlsoRefund(e.target.checked)
                    setConfirming(false)
                  }}
                />
                <span>
                  <span className="font-medium">Also refund to original payment</span>
                  <span className="mt-0.5 block text-muted-foreground">
                    Refunds the PeptSci Stripe charge (invoice or card) for this order.
                  </span>
                </span>
              </label>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {confirming ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Cancel order{orderNumber ? ` #${orderNumber}` : ''}
                  {alsoRefund && hasStripePayment ? ' and issue a full refund' : ''}? This cannot be
                  undone.
                </p>
                <div className="flex gap-2">
                  <Button
                    className="flex-1 bg-red-600 text-white hover:bg-red-700"
                    disabled={submitting}
                    onClick={() => void submit()}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cancelling…
                      </>
                    ) : (
                      'Confirm cancel'
                    )}
                  </Button>
                  <Button variant="outline" disabled={submitting} onClick={() => setConfirming(false)}>
                    Back
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                className="w-full bg-red-600 text-white hover:bg-red-700"
                onClick={() => setConfirming(true)}
              >
                Cancel fulfillment
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
