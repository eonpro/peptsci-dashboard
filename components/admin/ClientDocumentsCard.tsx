'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { DOCUMENT_TYPE_LABELS, type DocumentType } from '@/lib/documents'
import {
  FileText,
  Eye,
  CheckCircle2,
  Ban,
  Loader2,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react'

interface DocRow {
  id: string
  type: string
  label: string | null
  fileName: string | null
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED'
  reviewNotes: string | null
  reviewedAt: string | null
  expiresAt: string | null
  expiryState: 'valid' | 'expiring_soon' | 'expired'
  createdAt: string
}

const statusStyles: Record<DocRow['status'], string> = {
  PENDING_REVIEW: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  APPROVED: 'bg-green-500/20 text-green-400 border-green-500/30',
  REJECTED: 'bg-red-500/20 text-red-400 border-red-500/30',
}

/** Admin review panel for a practice's compliance documents. */
export function ClientDocumentsCard({ clientId }: { clientId: string }) {
  const [docs, setDocs] = useState<DocRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState('')

  const load = useCallback(() => {
    fetch(`/api/admin/clients/${clientId}/documents`)
      .then((r) => (r.ok ? r.json() : { documents: [] }))
      .then((data) => setDocs(data.documents ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [clientId])

  useEffect(() => {
    load()
  }, [load])

  const review = async (
    docId: string,
    body: { status?: string; reviewNotes?: string | null; expiresAt?: string | null }
  ) => {
    setBusy(docId)
    setError(null)
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/documents/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || 'Could not update document')
      setRejecting(null)
      setRejectNote('')
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update document')
    } finally {
      setBusy(null)
    }
  }

  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '—'

  return (
    <Card className="bg-[#0a0e3a]/50 border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-white">
          <FileText className="h-5 w-5" /> Compliance Documents
          {docs.some((d) => d.status === 'PENDING_REVIEW') && (
            <Badge variant="outline" className="bg-amber-500/20 text-amber-400 border-amber-500/30">
              {docs.filter((d) => d.status === 'PENDING_REVIEW').length} awaiting review
            </Badge>
          )}
        </CardTitle>
        <CardDescription className="text-white/50">
          License / DEA / insurance / resale certificates uploaded by the practice.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm p-3">
            {error}
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-6 text-white/50">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : docs.length === 0 ? (
          <p className="text-sm text-white/50">No documents uploaded yet.</p>
        ) : (
          docs.map((doc) => (
            <div key={doc.id} className="rounded-lg border border-white/10 p-3 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">
                    {DOCUMENT_TYPE_LABELS[doc.type as DocumentType] ?? doc.type}
                    {doc.label ? ` — ${doc.label}` : ''}
                  </p>
                  <p className="text-xs text-white/50 truncate">
                    {doc.fileName ?? 'file'} · uploaded {fmt(doc.createdAt)}
                    {doc.reviewedAt ? ` · reviewed ${fmt(doc.reviewedAt)}` : ''}
                  </p>
                  {doc.reviewNotes && (
                    <p className="text-xs text-white/60 mt-0.5">Note: {doc.reviewNotes}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
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
                  <Badge variant="outline" className={statusStyles[doc.status]}>
                    {doc.status.replace('_', ' ')}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white/60 hover:text-white"
                    asChild
                  >
                    <a
                      href={`/api/admin/clients/${clientId}/documents/${doc.id}/file`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Eye className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-white/50">Expires</span>
                  <Input
                    type="date"
                    className="h-8 w-[150px] bg-white/5 border-white/10 text-white text-xs rounded-lg"
                    defaultValue={doc.expiresAt ? doc.expiresAt.slice(0, 10) : ''}
                    onBlur={(e) => {
                      const v = e.target.value
                      const next = v ? new Date(v).toISOString() : null
                      const current = doc.expiresAt ?? null
                      if ((next ?? '') !== (current ?? '')) {
                        void review(doc.id, { expiresAt: next })
                      }
                    }}
                  />
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {doc.status !== 'APPROVED' && (
                    <Button
                      size="sm"
                      className="h-8 bg-green-600 hover:bg-green-700 text-white rounded-lg"
                      disabled={busy === doc.id}
                      onClick={() => review(doc.id, { status: 'APPROVED', reviewNotes: null })}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                    </Button>
                  )}
                  {doc.status !== 'REJECTED' && rejecting !== doc.id && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-lg"
                      disabled={busy === doc.id}
                      onClick={() => {
                        setRejecting(doc.id)
                        setRejectNote('')
                      }}
                    >
                      <Ban className="h-3.5 w-3.5 mr-1" /> Reject
                    </Button>
                  )}
                  {doc.status !== 'PENDING_REVIEW' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-white/50 hover:text-white rounded-lg"
                      disabled={busy === doc.id}
                      onClick={() => review(doc.id, { status: 'PENDING_REVIEW' })}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1" /> Re-review
                    </Button>
                  )}
                </div>
              </div>

              {rejecting === doc.id && (
                <div className="flex items-center gap-2">
                  <Input
                    className="h-9 bg-white/5 border-white/10 text-white text-sm rounded-lg"
                    placeholder="Reason shown to the client (e.g. document is expired / unreadable)"
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                  />
                  <Button
                    size="sm"
                    className="h-9 bg-red-600 hover:bg-red-700 text-white rounded-lg shrink-0"
                    disabled={busy === doc.id}
                    onClick={() =>
                      review(doc.id, { status: 'REJECTED', reviewNotes: rejectNote.trim() || null })
                    }
                  >
                    {busy === doc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm reject'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 text-white/50 rounded-lg shrink-0"
                    onClick={() => setRejecting(null)}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
