'use client'

import { useEffect, useRef, useState } from 'react'
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
import { Loader2, AlertCircle, Camera, Upload, X, CheckCircle2 } from 'lucide-react'

export type PackPhotoOrder = {
  id: string
  orderNumber: number
  items: { name: string; dose: string | null; quantity: number }[]
}

export type PackPhotoModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  order: PackPhotoOrder
  onPacked?: () => void
}

// Mirror the server limits so bad files fail fast with a clear message.
const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

function validateFile(f: File): string | null {
  const isHeic = f.type === 'image/heic' || f.type === 'image/heif' || /\.hei[cf]$/i.test(f.name)
  if (isHeic) {
    return 'HEIC photos are not supported. On iPhone, go to Settings → Camera → Formats and choose "Most Compatible".'
  }
  if (!ALLOWED_TYPES.includes(f.type)) return 'Invalid file type. Upload a JPEG, PNG, or WebP image.'
  if (f.size > MAX_FILE_SIZE) {
    return `File is too large (${(f.size / (1024 * 1024)).toFixed(1)}MB). Maximum size is 10MB.`
  }
  return null
}

/**
 * Pack step with mandatory contents photo: the packer photographs the actual
 * products going INTO the box (open package), then the order advances to
 * PACKED. The photo is stored as the order's package photo so the client can
 * see exactly what shipped.
 */
export default function PackPhotoModal({ open, onOpenChange, order, onPacked }: PackPhotoModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setFile(null)
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setNotes('')
    setError(null)
  }, [open])

  const onFileChange = (f: File | null) => {
    setError(null)
    if (f) {
      const validationError = validateFile(f)
      if (validationError) {
        setError(validationError)
        f = null
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    }
    setFile(f)
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return f ? URL.createObjectURL(f) : null
    })
  }

  const submit = async () => {
    if (!file) return setError('Photograph the products in the box before marking packed.')
    setSubmitting(true)
    setError(null)
    try {
      // 1) Store the contents photo against the order.
      const fd = new FormData()
      fd.append('orderRef', String(order.orderNumber))
      fd.append('photo', file)
      fd.append('notes', notes.trim() ? `Packing photo — ${notes.trim()}` : 'Packing photo (contents)')
      const photoRes = await fetch('/api/admin/package-photos', { method: 'POST', body: fd })
      const photoData = await photoRes.json().catch(() => ({}))
      if (!photoRes.ok) throw new Error(photoData.message || photoData.error || 'Photo upload failed')

      // 2) Advance the order to PACKED.
      const packRes = await fetch(`/api/admin/orders/${order.id}/fulfillment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pack' }),
      })
      if (!packRes.ok) {
        const data = await packRes.json().catch(() => ({}))
        throw new Error(data.message || data.error || 'Photo saved, but marking packed failed — retry.')
      }

      onPacked?.()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to complete packing')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" /> Pack Order #{order.orderNumber}
          </DialogTitle>
          <DialogDescription>
            Photograph the products inside the open box — before sealing — then mark it packed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {order.items.length > 0 && (
            <div className="rounded-lg border p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Should contain
              </p>
              <ul className="space-y-1 text-sm">
                {order.items.map((it, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    {it.quantity}× {it.name}
                    {it.dose ? ` ${it.dose}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <Label>Contents photo (required)</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            {preview ? (
              <div className="relative mt-1 overflow-hidden rounded-xl border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Contents preview" className="max-h-64 w-full bg-black/5 object-contain" />
                <button
                  onClick={() => onFileChange(null)}
                  className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
                  aria-label="Remove photo"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-1 flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border py-8 text-muted-foreground transition-colors hover:border-muted-foreground/70 hover:text-foreground/90"
              >
                <Upload className="h-7 w-7" />
                <span className="text-sm">Tap to photograph the open box</span>
              </button>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="pack-notes">Notes (optional)</Label>
            <Input
              id="pack-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. cold pack included"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <Button className="w-full" disabled={!file || submitting} onClick={() => void submit()}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Save Photo & Mark Packed
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
