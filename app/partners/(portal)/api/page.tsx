'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Copy, KeyRound, Webhook } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '../_components/PageHeader'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

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
  const [loading, setLoading] = useState(true)
  const [confirmRevoke, setConfirmRevoke] = useState<ApiKeyRow | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<WebhookRow | null>(null)

  const load = useCallback(async () => {
    try {
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
    } finally {
      setLoading(false)
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
    if (res.ok) {
      toast.success(hook.active ? 'Webhook paused' : 'Webhook resumed')
      void load()
    }
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
      <PageHeader
        title="API & webhooks"
        description="Read-only programmatic access to your numbers, plus signed event notifications."
      />

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
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-emerald-700 hover:text-emerald-900"
              onClick={() => copy(newKey)}
              aria-label="Copy key"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        )}

        <Card>
          <CardContent className="p-4">
            <form onSubmit={createKey} className="flex flex-wrap items-center gap-2">
              <Input
                name="name"
                required
                maxLength={120}
                placeholder="Key name (e.g. CRM sync)"
                aria-label="Key name"
                className="w-auto bg-white"
              />
              <Button type="submit" disabled={busy} className="font-semibold">
                Create key
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <TableHead className="text-xs uppercase tracking-wide">Name</TableHead>
                <TableHead className="text-xs uppercase tracking-wide">Prefix</TableHead>
                <TableHead className="text-xs uppercase tracking-wide">Last used</TableHead>
                <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
                <TableHead className="text-xs uppercase tracking-wide" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading &&
                [0, 1, 2].map((i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5} className="py-3">
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              {!loading && keys.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <EmptyState icon={KeyRound} title="No API keys yet." className="py-4" />
                  </TableCell>
                </TableRow>
              )}
              {keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="py-3">{k.name}</TableCell>
                  <TableCell className="py-3"><code className="text-xs">{k.keyPrefix}…</code></TableCell>
                  <TableCell className="py-3">
                    {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Never'}
                  </TableCell>
                  <TableCell className="py-3">
                    <Badge
                      variant="outline"
                      className={cn(
                        'font-medium',
                        k.revokedAt
                          ? 'border-red-200 bg-red-100 text-red-600'
                          : 'border-emerald-200 bg-emerald-100 text-emerald-700'
                      )}
                    >
                      {k.revokedAt ? 'Revoked' : 'Active'}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3 text-right">
                    {!k.revokedAt && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 text-sm font-normal text-red-600 hover:bg-transparent hover:text-red-700 hover:underline"
                        onClick={() => setConfirmRevoke(k)}
                      >
                        Revoke
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </Card>
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
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-emerald-700 hover:text-emerald-900"
              onClick={() => copy(newSecret)}
              aria-label="Copy secret"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        )}

        <Card>
          <CardContent className="p-4">
        <form onSubmit={createWebhook} className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              name="url"
              type="url"
              required
              placeholder="https://your-crm.example.com/hooks/peptsci"
              aria-label="Webhook URL"
              className="min-w-[300px] flex-1 bg-white"
            />
            <Button type="submit" disabled={busy} className="font-semibold">
              Add webhook
            </Button>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-slate-600">
            {events.map((ev) => (
              <label key={ev} className="flex items-center gap-1.5">
                {/* Native checkbox: read via FormData by name on submit. */}
                <input type="checkbox" name={`event:${ev}`} defaultChecked />
                <code className="text-xs">{ev}</code>
              </label>
            ))}
          </div>
        </form>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <TableHead className="text-xs uppercase tracking-wide">URL</TableHead>
                <TableHead className="text-xs uppercase tracking-wide">Events</TableHead>
                <TableHead className="text-xs uppercase tracking-wide">Last delivery</TableHead>
                <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
                <TableHead className="text-xs uppercase tracking-wide" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading &&
                [0, 1].map((i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5} className="py-3">
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              {!loading && webhooks.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <EmptyState icon={Webhook} title="No webhooks yet." className="py-4" />
                  </TableCell>
                </TableRow>
              )}
              {webhooks.map((hook) => (
                <TableRow key={hook.id}>
                  <TableCell className="max-w-[280px] truncate py-3"><code className="text-xs">{hook.url}</code></TableCell>
                  <TableCell className="py-3 text-xs text-slate-500">
                    {hook.events.length === 0 ? 'All events' : hook.events.join(', ')}
                  </TableCell>
                  <TableCell className="py-3">
                    {hook.lastDeliveryAt
                      ? `${new Date(hook.lastDeliveryAt).toLocaleString()} (${hook.lastStatus || 'error'})`
                      : 'Never'}
                  </TableCell>
                  <TableCell className="py-3">
                    <Badge
                      variant="outline"
                      className={cn(
                        'font-medium',
                        hook.active
                          ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                          : 'border-slate-200 bg-slate-100 text-slate-500'
                      )}
                    >
                      {hook.active ? 'Active' : 'Paused'}
                    </Badge>
                  </TableCell>
                  <TableCell className="space-x-3 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 text-sm font-normal text-primary hover:bg-transparent hover:underline"
                      onClick={() => void toggleWebhook(hook)}
                    >
                      {hook.active ? 'Pause' : 'Resume'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 text-sm font-normal text-red-600 hover:bg-transparent hover:text-red-700 hover:underline"
                      onClick={() => setConfirmDelete(hook)}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </Card>
      </section>

      <AlertDialog open={!!confirmRevoke} onOpenChange={(open) => !open && setConfirmRevoke(null)}>
        <AlertDialogContent className="bg-white text-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API key?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-500">
              {confirmRevoke
                ? `"${confirmRevoke.name}" (${confirmRevoke.keyPrefix}…) will stop working immediately. This can't be undone.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                if (confirmRevoke) void revokeKey(confirmRevoke.id)
                setConfirmRevoke(null)
              }}
            >
              Revoke key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent className="bg-white text-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete webhook?</AlertDialogTitle>
            <AlertDialogDescription className="break-all text-slate-500">
              {confirmDelete
                ? `Deliveries to ${confirmDelete.url} will stop immediately. This can't be undone.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                if (confirmDelete) void deleteWebhook(confirmDelete.id)
                setConfirmDelete(null)
              }}
            >
              Delete webhook
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
