'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Copy, KeyRound, Webhook } from 'lucide-react'

interface ApiKeyRow {
  id: string
  name: string
  keyPrefix: string
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
}

interface WebhookRow {
  id: string
  url: string
  events: string[]
  active: boolean
  lastDeliveryAt: string | null
  lastStatus: number | null
}

export default function PartnerApiPage() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([])
  const [webhooks, setWebhooks] = useState<WebhookRow[]>([])
  const [events, setEvents] = useState<string[]>([])
  const [newKey, setNewKey] = useState<string | null>(null)
  const [newSecret, setNewSecret] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [keysRes, hooksRes] = await Promise.all([
      fetch('/api/partners/api-keys'),
      fetch('/api/partners/webhooks'),
    ])
    if (keysRes.ok) setKeys((await keysRes.json()).keys)
    if (hooksRes.ok) {
      const data = await hooksRes.json()
      setWebhooks(data.webhooks)
      setEvents(data.events)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function createKey(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formEl = e.currentTarget
    const name = new FormData(formEl).get('name')
    setBusy(true)
    try {
      const res = await fetch('/api/partners/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.message || 'Failed to create key')
        return
      }
      setNewKey(data.key)
      formEl.reset()
      void load()
    } finally {
      setBusy(false)
    }
  }

  async function revokeKey(id: string) {
    const res = await fetch(`/api/partners/api-keys?id=${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Key revoked')
      void load()
    } else {
      toast.error('Failed to revoke key')
    }
  }

  async function createWebhook(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formEl = e.currentTarget
    const form = new FormData(formEl)
    const selected = events.filter((ev) => form.get(`event:${ev}`) === 'on')
    setBusy(true)
    try {
      const res = await fetch('/api/partners/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: form.get('url'), events: selected }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.message || 'Failed to create webhook')
        return
      }
      setNewSecret(data.webhook.secret)
      formEl.reset()
      void load()
    } finally {
      setBusy(false)
    }
  }

  async function toggleWebhook(hook: WebhookRow) {
    const res = await fetch('/api/partners/webhooks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookId: hook.id, active: !hook.active }),
    })
    if (res.ok) void load()
  }

  async function deleteWebhook(id: string) {
    const res = await fetch(`/api/partners/webhooks?id=${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Webhook removed')
      void load()
    }
  }

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text)
    toast.success('Copied')
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">API &amp; webhooks</h1>
        <p className="text-sm text-slate-500">
          Read-only programmatic access to your numbers, plus signed event notifications.
        </p>
      </div>

      {/* API keys */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <KeyRound className="h-4 w-4" /> API keys
        </h2>
        <p className="text-sm text-slate-500">
          Call <code className="rounded bg-slate-100 px-1.5 py-0.5">GET /api/partner/v1/&lt;summary|transactions|payouts|clinics|links&gt;</code>{' '}
          with <code className="rounded bg-slate-100 px-1.5 py-0.5">Authorization: Bearer &lt;key&gt;</code>.
        </p>

        {newKey && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
            <span className="font-medium text-emerald-800">Copy your new key now — it won&rsquo;t be shown again:</span>
            <code className="rounded bg-white px-2 py-1 text-xs">{newKey}</code>
            <button onClick={() => copy(newKey)} className="text-emerald-700 hover:text-emerald-900">
              <Copy className="h-4 w-4" />
            </button>
          </div>
        )}

        <form onSubmit={createKey} className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-4">
          <input name="name" required maxLength={120} placeholder="Key name (e.g. CRM sync)" className="rounded-md border px-3 py-2 text-sm" />
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-[#213cef] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1a30c4] disabled:opacity-60"
          >
            Create key
          </button>
        </form>

        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Prefix</th>
                <th className="px-4 py-3">Last used</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {keys.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">No API keys yet.</td>
                </tr>
              )}
              {keys.map((k) => (
                <tr key={k.id} className="border-b last:border-0">
                  <td className="px-4 py-3">{k.name}</td>
                  <td className="px-4 py-3"><code className="text-xs">{k.keyPrefix}…</code></td>
                  <td className="px-4 py-3">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Never'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${k.revokedAt ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'}`}>
                      {k.revokedAt ? 'Revoked' : 'Active'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!k.revokedAt && (
                      <button onClick={() => void revokeKey(k.id)} className="text-sm text-red-600 hover:underline">
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Webhooks */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <Webhook className="h-4 w-4" /> Webhooks
        </h2>
        <p className="text-sm text-slate-500">
          Deliveries are signed with <code className="rounded bg-slate-100 px-1.5 py-0.5">X-PeptSci-Signature: t=…,v1=HMAC-SHA256(secret, t.body)</code>.
        </p>

        {newSecret && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
            <span className="font-medium text-emerald-800">Signing secret — copy it now:</span>
            <code className="rounded bg-white px-2 py-1 text-xs">{newSecret}</code>
            <button onClick={() => copy(newSecret)} className="text-emerald-700 hover:text-emerald-900">
              <Copy className="h-4 w-4" />
            </button>
          </div>
        )}

        <form onSubmit={createWebhook} className="space-y-2 rounded-xl border bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              name="url"
              type="url"
              required
              placeholder="https://your-crm.example.com/hooks/peptsci"
              className="min-w-[300px] flex-1 rounded-md border px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-[#213cef] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1a30c4] disabled:opacity-60"
            >
              Add webhook
            </button>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-slate-600">
            {events.map((ev) => (
              <label key={ev} className="flex items-center gap-1.5">
                <input type="checkbox" name={`event:${ev}`} defaultChecked />
                <code className="text-xs">{ev}</code>
              </label>
            ))}
          </div>
        </form>

        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">URL</th>
                <th className="px-4 py-3">Events</th>
                <th className="px-4 py-3">Last delivery</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {webhooks.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">No webhooks yet.</td>
                </tr>
              )}
              {webhooks.map((hook) => (
                <tr key={hook.id} className="border-b last:border-0">
                  <td className="max-w-[280px] truncate px-4 py-3"><code className="text-xs">{hook.url}</code></td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {hook.events.length === 0 ? 'All events' : hook.events.join(', ')}
                  </td>
                  <td className="px-4 py-3">
                    {hook.lastDeliveryAt
                      ? `${new Date(hook.lastDeliveryAt).toLocaleString()} (${hook.lastStatus || 'error'})`
                      : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${hook.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {hook.active ? 'Active' : 'Paused'}
                    </span>
                  </td>
                  <td className="space-x-3 px-4 py-3 text-right">
                    <button onClick={() => void toggleWebhook(hook)} className="text-sm text-[#213cef] hover:underline">
                      {hook.active ? 'Pause' : 'Resume'}
                    </button>
                    <button onClick={() => void deleteWebhook(hook.id)} className="text-sm text-red-600 hover:underline">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
