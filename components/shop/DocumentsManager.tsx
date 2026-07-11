'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DOCUMENT_TYPE_LABELS, MAX_DOCUMENT_BYTES, type DocumentType } from '@/lib/documents'
import { FileText, Upload, Trash2, Loader2, Eye, AlertTriangle } from 'lucide-react'

interface DocumentRow {
  id: string
  type: string
  label: string | null
  fileName: string | null
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED'
  reviewNotes: string | null
  expiresAt: string | null
  expiryState: 'valid' | 'expiring_soon' | 'expired'
  createdAt: string
}

const statusBadge: Record<DocumentRow['status'], { label: string; className: string }> = {
  PENDING_REVIEW: { label: 'In Review', className: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  APPROVED: { label: 'Approved', className: 'bg-green-500/20 text-green-300 border-green-500/30' },
  REJECTED: { label: 'Rejected', className: 'bg-red-500/20 text-red-300 border-red-500/30' },
}

/**
 * Compliance document uploads for the practice (license / DEA / insurance /
 * resale cert). `light` renders on white surfaces (pending-approval page);
 * default matches the dark client-portal theme.
 */
export function DocumentsManager({ light = false }: { light?: boolean }) {
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [notLinked, setNotLinked] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [type, setType] = useState<DocumentType>('LICENSE')
  const [expiresAt, setExpiresAt] = useState('')
  const [label, setLabel] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    fetch('/api/shop/documents')
      .then((r) => {
        if (r.status === 403) {
          setNotLinked(true)
          return { documents: [] }
        }
        return r.ok ? r.json() : { documents: [] }
      })
      .then((data) => setDocuments(data.documents ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) {
      setError('Choose a file to upload.')
      return
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      setError('File must be 10MB or smaller.')
      return
    }
    setUploading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('type', type)
      if (expiresAt) form.append('expiresAt', new Date(expiresAt).toISOString())
      if (label.trim()) form.append('label', label.trim())

      const res = await fetch('/api/shop/documents', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || 'Upload failed')

      if (fileRef.current) fileRef.current.value = ''
      setExpiresAt('')
      setLabel('')
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/shop/documents/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || 'Could not delete')
      setDocuments((prev) => prev.filter((d) => d.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete')
    }
  }

  const text = light ? 'text-gray-900' : 'text-white'
  const muted = light ? 'text-gray-500' : 'text-white/50'
  const surface = light ? 'bg-gray-50 border-gray-200' : 'bg-white/5 border-white/10'
  const inputCls = light
    ? 'h-11 bg-white border-gray-200 rounded-xl'
    : 'h-11 bg-white/5 border-white/10 text-white rounded-xl'

  if (notLinked) {
    return (
      <p className={`text-sm ${light ? 'text-gray-500' : 'text-white/50'}`}>
        Complete your practice registration first — document uploads unlock once your practice
        profile is created.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-3">
          {error}
        </div>
      )}

      {/* Upload form */}
      <div className={`rounded-xl border p-4 space-y-3 ${surface}`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className={muted}>Document type</Label>
            <Select value={type} onValueChange={(v) => setType(v as DocumentType)}>
              <SelectTrigger className={inputCls}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(DOCUMENT_TYPE_LABELS) as DocumentType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {DOCUMENT_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className={muted}>Expiration date (if any)</Label>
            <Input
              type="date"
              className={inputCls}
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
        </div>
        {type === 'OTHER' && (
          <div className="space-y-1.5">
            <Label className={muted}>Label</Label>
            <Input
              className={inputCls}
              placeholder="What is this document?"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className={`text-sm ${muted} file:mr-3 file:rounded-lg file:border-0 file:bg-brand-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-[#1a30c0]`}
          />
          <Button
            onClick={handleUpload}
            disabled={uploading}
            className="bg-brand-primary hover:bg-[#1a30c0] text-white rounded-xl sm:ml-auto"
          >
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading…
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" /> Upload
              </>
            )}
          </Button>
        </div>
        <p className={`text-xs ${muted}`}>PDF, JPEG, PNG, or WebP · max 10MB</p>
      </div>

      {/* Document list */}
      {loading ? (
        <div className={`flex items-center justify-center py-8 ${muted}`}>
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : documents.length === 0 ? (
        <p className={`text-sm ${muted}`}>
          No documents on file yet. Upload your license and DEA registration to speed up approval.
        </p>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => {
            const badge = statusBadge[doc.status]
            return (
              <div
                key={doc.id}
                className={`flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border p-3 ${surface}`}
              >
                <FileText className={`h-5 w-5 shrink-0 ${muted}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${text}`}>
                    {DOCUMENT_TYPE_LABELS[doc.type as DocumentType] ?? doc.type}
                    {doc.label ? ` — ${doc.label}` : ''}
                  </p>
                  <p className={`text-xs ${muted} truncate`}>
                    {doc.fileName ?? 'file'} · uploaded{' '}
                    {new Date(doc.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                    {doc.expiresAt &&
                      ` · expires ${new Date(doc.expiresAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}`}
                  </p>
                  {doc.status === 'REJECTED' && doc.reviewNotes && (
                    <p className="text-xs text-red-400 mt-1">{doc.reviewNotes}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {doc.expiryState !== 'valid' && (
                    <Badge
                      variant="outline"
                      className={
                        doc.expiryState === 'expired'
                          ? 'bg-red-500/20 text-red-400 border-red-500/30'
                          : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                      }
                    >
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {doc.expiryState === 'expired' ? 'Expired' : 'Expiring soon'}
                    </Badge>
                  )}
                  <Badge variant="outline" className={badge.className}>
                    {badge.label}
                  </Badge>
                  <Button variant="ghost" size="icon" className={muted} asChild>
                    <a href={`/api/shop/documents/${doc.id}/file`} target="_blank" rel="noreferrer">
                      <Eye className="h-4 w-4" />
                    </a>
                  </Button>
                  {doc.status === 'PENDING_REVIEW' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-400 hover:text-red-300"
                      onClick={() => handleDelete(doc.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
