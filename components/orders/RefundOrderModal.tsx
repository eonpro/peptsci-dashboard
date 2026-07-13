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
import { Loader2, CheckCircle2, AlertCircle, Undo2 } from 'lucide-react'

export type RefundOrderModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: string
  orderNumber?: number
  onRefunded?: () => void
}

type RefundInfo = {
  orderNumber: number
  total: number
  refundedTotal: number
  remaining: number
  paymentStatus: string
  hasStripePayment: boolean
}

function formatPrice(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

const REASONS = [
  { id: 'requested_by_customer', label: 'Requested by customer' },
  { id: 'duplicate', label: 'Duplicate charge' },
  { id: 'fraudulent', label: 'Fraudulent' },
] as const

export default function RefundOrderModal({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  onRefunded,
}: RefundOrderModalProps) {
  const [loading, setLoading] = useState(true)
  const [info, setInfo] = useState<RefundInfo | null>(null)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState<(typeof REASONS)[number]['id']>('requested_by_customer')
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ amount: number; fullyRefunded: boolean } | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    setDone(null)
    setConfirming(false)
    fetch(`/api/admin/orders/${orderId}/refund`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.message || 'Failed to load refund info')
        return data as RefundInfo
      })
      .then((data) => {
        setInfo(data)
        setAmount(data.remaining > 0 ? data.remaining.toFixed(2) : '')
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load refund info'))
      .finally(() => setLoading(false))
  }, [open, orderId])

  const parsedAmount = Number(amount)
  const amountValid =
    Number.isFinite(parsedAmount) && parsedAmount > 0 && info != null && parsedAmount <= info.remaining + 0.005
  const isFull = info != null && amountValid && parsedAmount >= info.remaining - 0.005

  const submit = async () => {
    if (!amountValid) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parsedAmount, reason }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || 'Refund failed')
      setDone({ amount: data.amount, fullyRefunded: data.fullyRefunded })
      onRefunded?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refund failed')
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
            <Undo2 className="h-5 w-5" /> Refund Order{orderNumber ? ` #${orderNumber}` : ''}
          </DialogTitle>
          <DialogDescription>
            Refunds go back to the original payment method via Stripe.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : done ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
            <p className="font-medium">{formatPrice(done.amount)} refunded</p>
            <p className="text-sm text-muted-foreground">
              {done.fullyRefunded
                ? 'Order fully refunded — reserved stock has been released.'
                : 'Partial refund recorded. The order remains active.'}
            </p>
            <Button className="mt-2" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        ) : !info?.hasStripePayment ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            This order was not paid by card through Stripe (billed to account or unpaid), so it
            cannot be refunded here.
          </div>
        ) : info.remaining <= 0 ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            This order is already fully refunded.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Order total</span>
                <span>{formatPrice(info.total)}</span>
              </div>
              {info.refundedTotal > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Already refunded</span>
                  <span>-{formatPrice(info.refundedTotal)}</span>
                </div>
              )}
              <div className="mt-1 flex justify-between border-t pt-1 font-medium">
                <span>Refundable</span>
                <span>{formatPrice(info.remaining)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="refund-amount">Refund amount</Label>
              <Input
                id="refund-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value.replace(/[^\d.]/g, ''))
                  setConfirming(false)
                }}
              />
              {!amountValid && amount !== '' && (
                <p className="text-xs text-red-600">
                  Enter an amount between $0.01 and {formatPrice(info.remaining)}.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Reason</Label>
              <div className="flex flex-wrap gap-2">
                {REASONS.map((r) => (
                  <Button
                    key={r.id}
                    type="button"
                    size="sm"
                    variant={reason === r.id ? 'default' : 'outline'}
                    onClick={() => setReason(r.id)}
                  >
                    {r.label}
                  </Button>
                ))}
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {confirming ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Refund {formatPrice(parsedAmount)}
                  {isFull ? ' (full refund — releases reserved stock)' : ''}? This cannot be
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
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Refunding…
                      </>
                    ) : (
                      'Confirm refund'
                    )}
                  </Button>
                  <Button variant="outline" disabled={submitting} onClick={() => setConfirming(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button className="w-full" disabled={!amountValid} onClick={() => setConfirming(true)}>
                Refund {amountValid ? formatPrice(parsedAmount) : ''}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
