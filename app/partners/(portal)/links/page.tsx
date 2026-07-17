'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Copy, Link2, Plus } from 'lucide-react'

interface LinkRow {
  id: string
  code: string
  url: string
  label: string | null
  active: boolean
  clickCount: number
  signupCount: number
  rep: { id: string; name: string } | null
}

export default function PartnerLinksPage() {
  const [links, setLinks] = useState<LinkRow[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [label, setLabel] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/partners/links')
      const data = await res.json()
      if (res.ok) setLinks(data.links)
      else toast.error(data.message || 'Failed to load links')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function createLink() {
    setCreating(true)
    try {
      const res = await fetch('/api/partners/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.message || 'Failed to create link')
        return
      }
      toast.success('Referral link created')
      setLabel('')
      void load()
    } finally {
      setCreating(false)
    }
  }

  async function toggle(link: LinkRow) {
    const res = await fetch('/api/partners/links', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkId: link.id, active: !link.active }),
    })
    if (res.ok) {
      toast.success(link.active ? 'Link deactivated — it no longer attributes signups' : 'Link reactivated')
      void load()
    } else {
      toast.error('Failed to update link')
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Referral links</h1>
        <p className="text-sm text-slate-500">
          Share these links with prospective clinics. Anyone who signs up within 90 days of
          clicking is attributed to you.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-4">
        <Link2 className="h-4 w-4 text-slate-400" />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={120}
          placeholder="Label (e.g. Spring conference booth)"
          className="min-w-[240px] flex-1 rounded-md border px-3 py-2 text-sm"
        />
        <button
          onClick={() => void createLink()}
          disabled={creating}
          className="flex items-center gap-1 rounded-lg bg-[#213cef] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1a30c4] disabled:opacity-60"
        >
          <Plus className="h-4 w-4" /> New link
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Link</th>
              <th className="px-4 py-3">Label</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3 text-right">Clicks</th>
              <th className="px-4 py-3 text-right">Signups</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && links.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  No links yet — create your first referral link above.
                </td>
              </tr>
            )}
            {links.map((link) => (
              <tr key={link.id} className="border-b last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-slate-100 px-2 py-1 text-xs">{link.url}</code>
                    <button
                      onClick={() => {
                        void navigator.clipboard.writeText(link.url)
                        toast.success('Copied to clipboard')
                      }}
                      className="text-slate-400 hover:text-slate-700"
                      aria-label="Copy link"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3">{link.label || '—'}</td>
                <td className="px-4 py-3">{link.rep?.name || 'Organization'}</td>
                <td className="px-4 py-3 text-right">{link.clickCount}</td>
                <td className="px-4 py-3 text-right">{link.signupCount}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      link.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {link.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => void toggle(link)} className="text-sm text-[#213cef] hover:underline">
                    {link.active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
