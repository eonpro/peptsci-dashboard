'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, CheckCircle2, AlertCircle, Minus, Plus } from 'lucide-react'

export type ReturnableItem = {
  id: string
  name: string
  dose: string | null
  quantity: number
}

const REASONS = [
  { id: 'damaged_in_transit', label: 'Damaged in transit' },
  { id: 'wrong_item', label: 'Wrong item received' },
  { id: 'quality_issue', label: 'Quality issue' },
  { id: 'ordered_by_mistake', label: 'Ordered by mistake' },
  { id: 'other', label: 'Other' },
] as const

export function RequestReturnDialog({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  items,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: string
  orderNumber: number
  items: ReturnableItem[]
  onCreated?: () => void
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [reason, setReason] = useState<(typeof REASONS)[number]['id']>('damaged_in_transit')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rma, setRma] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setQuantities({})
      setError(null)
      setRma(null)
      setNotes('')
    }
  }, [open])

  const selected = useMemo(
    () => Object.entries(quantities).filter(([, q]) => q > 0),
    [quantities]
  )

  const setQty = (id: string, next: number, max: number) => {
    setQuantities((prev) => ({ ...prev, [id]: Math.max(0, Math.min(max, next)) }))
  }

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/shop/orders/${orderId}/returns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason,
          notes: notes.trim() || undefined,
          items: selected.map(([orderItemId, quantity]) => ({ orderItemId, quantity })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || 'Could not submit return request')
      setRma(data.rmaNumber)
      onCreated?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit return request')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Request a Return — Order #{orderNumber}</DialogTitle>
          <DialogDescription>
            Select the items and quantities you&apos;d like to return. Our team reviews every
            request and will follow up with return instructions.
          </DialogDescription>
        </DialogHeader>

        {rma ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
            <p className="font-medium">Return request submitted</p>
            <p className="text-sm text-muted-foreground">
              Your RMA number is <span className="font-mono font-medium">{rma}</span>. We&apos;ll
              email you with next steps.
            </p>
            <Button className="mt-2" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              {items.map((it) => {
                const qty = quantities[it.id] ?? 0
                return (
                  <div
                    key={it.id}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {it.name}
                        {it.dose ? ` ${it.dose}` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground">Ordered: {it.quantity}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-8 w-8"
                        disabled={qty <= 0}
                        onClick={() => setQty(it.id, qty - 1, it.quantity)}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="w-6 text-center text-sm font-medium">{qty}</span>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-8 w-8"
                        disabled={qty >= it.quantity}
                        onClick={() => setQty(it.id, qty + 1, it.quantity)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}
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

            <div className="space-y-2">
              <Label htmlFor="return-notes">Details (optional)</Label>
              <Textarea
                id="return-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything that helps us process this faster — batch numbers, photos available, etc."
                rows={3}
                maxLength={1000}
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <Button
              className="w-full"
              disabled={selected.length === 0 || submitting}
              onClick={() => void submit()}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…
                </>
              ) : (
                'Submit return request'
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
