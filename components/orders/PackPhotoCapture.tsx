'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, AlertCircle, Camera, X, CheckCircle2 } from 'lucide-react'

export type PackPhotoOrder = {
  id: string
  orderNumber: number
  items: { name: string; dose: string | null; quantity: number }[]
}

export type PackPhotoCaptureProps = {
  order: PackPhotoOrder
  /**
   * Flips to true when the surface becomes visible; resets the capture state so
   * a reopened modal or a revisited wizard step starts clean.
   */
  active: boolean
  submitLabel?: string
  /** Rendered to the left of the submit button (Back, Skip photo, …). */
  footer?: ReactNode
  /**
   * Runs after the photo is stored against the order. Throw to surface a
   * message inline — the photo is already saved at that point, so the operator
   * only needs to retry this last step.
   */
  onUploaded: () => Promise<void> | void
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
 * Contents-photo capture: the packer photographs the actual products going INTO
 * the box (open package) and the photo is stored as the order's package photo so
 * the client can see exactly what shipped. Advancing the order's fulfillment
 * state is the caller's job via `onUploaded`, which is why this is shared by the
 * standalone PackPhotoModal and the guided fulfillment wizard.
 */
export default function PackPhotoCapture({
  order,
  active,
  submitLabel = 'Save Photo & Mark Packed',
  footer,
  onUploaded,
}: PackPhotoCaptureProps) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)

  const cameraInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCameraOpen(false)
  }, [])

  useEffect(() => {
    if (!active) {
      stopCamera()
      return
    }
    setFile(null)
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setNotes('')
    setError(null)
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }, [active, stopCamera])

  // Attach the stream once the video element is mounted.
  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [cameraOpen])

  // Stop the camera if the component unmounts with it open.
  useEffect(() => stopCamera, [stopCamera])

  const onFileChange = (f: File | null) => {
    setError(null)
    if (f) {
      const validationError = validateFile(f)
      if (validationError) {
        setError(validationError)
        f = null
        if (cameraInputRef.current) cameraInputRef.current.value = ''
      }
    }
    setFile(f)
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return f ? URL.createObjectURL(f) : null
    })
  }

  const openCamera = async () => {
    setError(null)
    // Phones/tablets get the native full-screen camera via the capture input.
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    if (isMobile || !navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      streamRef.current = stream
      setCameraOpen(true)
    } catch {
      setError('Could not access the camera. Check browser permissions.')
    }
  }

  const capturePhoto = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    canvas.toBlob(
      (blob) => {
        if (blob) {
          onFileChange(
            new File([blob], `pack-${order.orderNumber}-${Date.now()}.jpg`, { type: 'image/jpeg' })
          )
        }
        stopCamera()
      },
      'image/jpeg',
      0.9
    )
  }

  const submit = async () => {
    if (!file) return setError('Photograph the products in the box before marking packed.')
    setSubmitting(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('orderRef', String(order.orderNumber))
      fd.append('photo', file)
      fd.append('notes', notes.trim() ? `Packing photo — ${notes.trim()}` : 'Packing photo (contents)')
      const photoRes = await fetch('/api/admin/package-photos', { method: 'POST', body: fd })
      const photoData = await photoRes.json().catch(() => ({}))
      if (!photoRes.ok) throw new Error(photoData.message || photoData.error || 'Photo upload failed')

      await onUploaded()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to complete packing')
    } finally {
      setSubmitting(false)
    }
  }

  return (
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
        {/* Mobile: capture attr opens the native camera. Desktop uses getUserMedia. */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          className="hidden"
        />
        {preview ? (
          <div className="relative mt-1 overflow-hidden rounded-xl border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Contents preview"
              className="max-h-64 w-full bg-black/5 object-contain"
            />
            <button
              type="button"
              onClick={() => onFileChange(null)}
              className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
              aria-label="Remove photo"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : cameraOpen ? (
          <div className="relative mt-1 overflow-hidden rounded-xl border bg-black">
            <video ref={videoRef} autoPlay playsInline muted className="max-h-64 w-full object-contain" />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 bg-gradient-to-t from-black/70 to-transparent p-3">
              <Button type="button" onClick={capturePhoto} size="sm">
                <Camera className="mr-2 h-4 w-4" /> Capture
              </Button>
              <Button type="button" onClick={stopCamera} size="sm" variant="outline">
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void openCamera()}
            className="mt-1 flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border py-8 text-muted-foreground transition-colors hover:border-muted-foreground/70 hover:text-foreground/90"
          >
            <Camera className="h-7 w-7" />
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

      <div className="flex items-center gap-2">
        {footer}
        <Button className="flex-1" disabled={!file || submitting} onClick={() => void submit()}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" /> {submitLabel}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
