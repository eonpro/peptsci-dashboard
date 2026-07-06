'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Camera,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  PackageCheck,
  PackageX,
} from 'lucide-react'

type Stats = { today: number; thisWeek: number; matched: number; total: number; matchRate: number; unmatched: number }

type PhotoRow = {
  id: string
  orderRef: string
  orderId: string | null
  trackingNumber: string | null
  trackingSource: string | null
  matched: boolean
  notes: string | null
  createdAt: string
  capturedBy: { firstName: string | null; lastName: string | null; email: string | null } | null
  order: { orderNumber: number; status: string } | null
  client: { organizationName: string } | null
}

export default function PackagePhotosPage() {
  const [orderRef, setOrderRef] = useState('')
  const [tracking, setTracking] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [stats, setStats] = useState<Stats | null>(null)
  const [photos, setPhotos] = useState<PhotoRow[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setLoadingList(true)
    setListError(null)
    Promise.all([
      fetch('/api/admin/package-photos?stats=true').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/admin/package-photos?limit=25').then((r) => (r.ok ? r.json() : { data: [] })),
    ])
      .then(([s, list]) => {
        if (s) setStats(s)
        setPhotos(list?.data ?? [])
      })
      .catch(() => setListError('Could not load recent captures. Please refresh the page.'))
      .finally(() => setLoadingList(false))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Mirror the server limits so bad files fail fast with a clear message
  // instead of a slow, failed upload.
  const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB, matches the server limit
  const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

  const validateFile = (f: File): string | null => {
    const isHeic =
      f.type === 'image/heic' ||
      f.type === 'image/heif' ||
      /\.hei[cf]$/i.test(f.name)
    if (isHeic) {
      return 'HEIC photos are not supported. On iPhone, go to Settings → Camera → Formats and choose "Most Compatible", or re-save the photo as JPEG.'
    }
    if (!ALLOWED_TYPES.includes(f.type)) {
      return 'Invalid file type. Upload a JPEG, PNG, or WebP image.'
    }
    if (f.size > MAX_FILE_SIZE) {
      return `File is too large (${(f.size / (1024 * 1024)).toFixed(1)}MB). Maximum size is 10MB.`
    }
    return null
  }

  const onFileChange = (f: File | null) => {
    setError(null)
    if (f) {
      const validationError = validateFile(f)
      if (validationError) {
        setError(validationError)
        setFile(null)
        if (preview) URL.revokeObjectURL(preview)
        setPreview(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
        return
      }
    }
    setFile(f)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(f ? URL.createObjectURL(f) : null)
  }

  const reset = () => {
    setOrderRef('')
    setTracking('')
    setNotes('')
    onFileChange(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async () => {
    setError(null)
    setSuccess(null)
    if (!orderRef.trim()) return setError('Order number is required')
    if (!file) return setError('Please capture or select a photo')
    const validationError = validateFile(file)
    if (validationError) return setError(validationError)

    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('orderRef', orderRef.trim())
      fd.append('photo', file)
      if (tracking.trim()) fd.append('trackingNumber', tracking.trim())
      if (notes.trim()) fd.append('notes', notes.trim())

      const res = await fetch('/api/admin/package-photos', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || data.error || 'Upload failed')

      setSuccess(
        data.matched
          ? `Photo saved and matched to order #${orderRef.trim()}.`
          : `Photo saved. No order matched "${orderRef.trim()}" yet — it can be re-matched later.`
      )
      reset()
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setSubmitting(false)
    }
  }

  const capturedByName = (p: PhotoRow) => {
    if (!p.capturedBy) return 'System'
    const name = [p.capturedBy.firstName, p.capturedBy.lastName].filter(Boolean).join(' ')
    return name || p.capturedBy.email || 'Unknown'
  }
  const formatDateTime = (d: string) =>
    new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
          <Camera className="h-6 w-6" /> Package Photos
        </h1>
        <p className="mt-1 text-sm text-white/60">
          Capture proof-of-shipment photos and match them to orders so clients can see them.
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Today" value={stats.today} />
          <StatCard label="This Week" value={stats.thisWeek} />
          <StatCard label="Matched" value={stats.matched} accent="text-green-400" />
          <StatCard label="Match Rate" value={`${stats.matchRate}%`} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Capture form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Capture Photo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}
            {success && (
              <div className="flex items-start gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-300">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                {success}
              </div>
            )}

            <div>
              <Label htmlFor="orderRef">Order Number</Label>
              <Input
                id="orderRef"
                value={orderRef}
                onChange={(e) => setOrderRef(e.target.value)}
                placeholder="e.g. 1042"
                autoComplete="off"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="tracking">Tracking (optional)</Label>
                <Input
                  id="tracking"
                  value={tracking}
                  onChange={(e) => setTracking(e.target.value)}
                  placeholder="Auto-detected if blank"
                />
              </div>
              <div>
                <Label htmlFor="notes">Notes (optional)</Label>
                <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. 2 boxes" />
              </div>
            </div>

            <div>
              <Label>Photo</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              {preview ? (
                <div className="relative mt-1 overflow-hidden rounded-xl border border-white/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="Preview" className="max-h-72 w-full object-contain bg-black/40" />
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
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-1 flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/15 py-10 text-white/50 transition-colors hover:border-white/30 hover:text-white/70"
                >
                  <Upload className="h-8 w-8" />
                  <span className="text-sm">Tap to take a photo or upload</span>
                </button>
              )}
            </div>

            <Button onClick={handleSubmit} disabled={submitting} className="w-full">
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
              {submitting ? 'Uploading…' : 'Save Package Photo'}
            </Button>
          </CardContent>
        </Card>

        {/* Audit list */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Captures</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingList ? (
              <div className="flex items-center justify-center py-10 text-white/60">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
              </div>
            ) : listError ? (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                {listError}
              </div>
            ) : photos.length === 0 ? (
              <p className="py-10 text-center text-white/50">No photos captured yet.</p>
            ) : (
              <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                {photos.map((p) => (
                  <a
                    key={p.id}
                    href={`/api/package-photos/${p.id}/image`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-lg border border-white/10 p-2 transition-colors hover:bg-white/5"
                  >
                    <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-md bg-black/40">
                      <Image
                        src={`/api/package-photos/${p.id}/image`}
                        alt={`Order ${p.orderRef}`}
                        fill
                        unoptimized
                        className="object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">
                          #{p.order?.orderNumber ?? p.orderRef}
                        </span>
                        {p.matched ? (
                          <Badge variant="outline" className="gap-1 border-green-500/40 text-xs text-green-400">
                            <PackageCheck className="h-3 w-3" /> Matched
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 border-amber-500/40 text-xs text-amber-400">
                            <PackageX className="h-3 w-3" /> Unmatched
                          </Badge>
                        )}
                      </div>
                      <p className="truncate text-xs text-white/50">
                        {p.client?.organizationName ? `${p.client.organizationName} · ` : ''}
                        {p.trackingNumber ? `${p.trackingNumber} · ` : ''}
                        {capturedByName(p)} · {formatDateTime(p.createdAt)}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <Card>
      <CardContent className="py-4 text-center">
        <p className={`text-2xl font-bold ${accent ?? 'text-white'}`}>{value}</p>
        <p className="text-xs text-white/50">{label}</p>
      </CardContent>
    </Card>
  )
}
