'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Copy, Loader2, ShoppingBag, Trash2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

type Connection = {
  id: string
  shopDomain: string
  apiVersion: string
  status: string
  lastWebhookAt: string | null
  lastError: string | null
  mappingCount?: number
  webhookUrl: string
}

type MappingRow = {
  shopifyVariantId: string
  shopifySku: string | null
  shopifyTitle: string | null
  variantId: string
}

type ShopifyVariant = {
  id: string
  gid: string
  sku: string | null
  title: string | null
}

type PeptSciVariant = {
  id: string
  sku: string | null
  dose: string | null
  productName: string
  label: string
}

type InboundLine = {
  id: string
  shopifyVariantId: string | null
  shopifySku: string | null
  shopifyTitle: string
  quantity: number
  variantId: string | null
  mappedLabel: string | null
}

type InboundOrder = {
  id: string
  shopifyOrderId: string
  shopifyOrderName: string | null
  status: string
  shipSpeed: string
  lastError: string | null
  createdAt: string
  invoice: { id: string; invoiceNumber: number; status: string } | null
  lines: InboundLine[]
}

const inputClass = 'h-12 bg-white/5 border-white/10 text-white rounded-xl'
const labelClass = 'text-white/70'
const selectClass =
  'h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white [&>option]:text-black'

/**
 * Per-client Shopify Custom App connection + variant mapping for white-label
 * fulfillment. Paid Shopify orders become invoices at client pricing, charge
 * card on file, then queue PeptSci fulfillment.
 */
export function ClientShopifyCard({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [connection, setConnection] = useState<Connection | null>(null)

  const [shopDomain, setShopDomain] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')

  const [shopifyVariants, setShopifyVariants] = useState<ShopifyVariant[]>([])
  const [peptsciVariants, setPeptsciVariants] = useState<PeptSciVariant[]>([])
  const [draftMaps, setDraftMaps] = useState<Record<string, string>>({})
  const [mapsLoading, setMapsLoading] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [inbounds, setInbounds] = useState<InboundOrder[]>([])
  const [lineDrafts, setLineDrafts] = useState<Record<string, string>>({})

  const loadConnection = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/shopify`)
      if (!res.ok) return
      const data = await res.json()
      const conn = data.connection as Connection | null
      setConnection(conn)
      if (conn) setShopDomain(conn.shopDomain)
    } catch {
      // non-critical card
    } finally {
      setLoading(false)
    }
  }, [clientId])

  const loadInbounds = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/shopify/inbounds`)
      if (!res.ok) return
      const data = await res.json()
      setInbounds(data.inbounds ?? [])
    } catch {
      // non-critical
    }
  }, [clientId])

  const loadMappings = useCallback(async () => {
    if (!connection) return
    setMapsLoading(true)
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/shopify/mappings`)
      if (!res.ok) throw new Error('Failed to load mappings')
      const data = await res.json()
      setShopifyVariants(data.shopifyVariants ?? [])
      setPeptsciVariants(data.peptsciVariants ?? [])
      setCatalogError(typeof data.catalogError === 'string' ? data.catalogError : null)
      const next: Record<string, string> = {}
      for (const m of data.mappings ?? []) {
        next[m.shopifyVariantId] = m.variantId
      }
      setDraftMaps(next)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load mappings')
    } finally {
      setMapsLoading(false)
    }
  }, [clientId, connection])

  useEffect(() => {
    void loadConnection()
  }, [loadConnection])

  useEffect(() => {
    if (connection) {
      void loadMappings()
      void loadInbounds()
    }
  }, [connection, loadMappings, loadInbounds])

  const matchInboundLine = async (inboundId: string, lineId: string) => {
    const variantId = lineDrafts[lineId]
    if (!variantId) {
      toast.error('Select a PeptSci product first')
      return
    }
    setBusy(true)
    try {
      const res = await fetch(
        `/api/admin/clients/${clientId}/shopify/inbounds/${inboundId}/match`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lineId, variantId }),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Match failed')
      if (data.fullyMapped) {
        toast.success(
          data.processResult?.status === 'fulfillment_queued'
            ? 'Matched — invoice charged and order queued'
            : data.processResult?.status === 'invoiced_unpaid'
              ? 'Matched — invoice created (charge pending)'
              : 'Fully mapped — processing'
        )
      } else {
        toast.success('Product matched')
      }
      await loadInbounds()
      await loadMappings()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Match failed')
    } finally {
      setBusy(false)
    }
  }

  const reprocessInbound = async (inboundId: string) => {
    setBusy(true)
    try {
      const res = await fetch(
        `/api/admin/clients/${clientId}/shopify/inbounds/${inboundId}/process`,
        { method: 'POST' }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Process failed')
      toast.success(`Processed: ${data.result?.status ?? 'ok'}`)
      await loadInbounds()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Process failed')
    } finally {
      setBusy(false)
    }
  }

  const saveConnection = async () => {
    setBusy(true)
    try {
      const body: Record<string, string> = { shopDomain }
      if (accessToken.trim()) body.accessToken = accessToken.trim()
      if (webhookSecret.trim()) body.webhookSecret = webhookSecret.trim()
      const res = await fetch(`/api/admin/clients/${clientId}/shopify`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(
          [data.message, data.code].filter(Boolean).join(' — ') || data.error || 'Save failed'
        )
      }
      setConnection(data.connection)
      setAccessToken('')
      setWebhookSecret('')
      toast.success('Shopify connection saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    if (!confirm('Disconnect Shopify? Existing SHOPIFY orders stay; new webhooks stop.')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/shopify`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Disconnect failed')
      setConnection(null)
      setDraftMaps({})
      setShopifyVariants([])
      toast.success('Shopify disconnected')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Disconnect failed')
    } finally {
      setBusy(false)
    }
  }

  const saveMappings = async () => {
    setBusy(true)
    try {
      const mappings: MappingRow[] = []
      for (const sv of shopifyVariants) {
        const variantId = draftMaps[sv.id]
        if (!variantId) continue
        mappings.push({
          shopifyVariantId: sv.id,
          shopifySku: sv.sku,
          shopifyTitle: sv.title,
          variantId,
        })
      }
      const res = await fetch(`/api/admin/clients/${clientId}/shopify/mappings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Save mappings failed')
      toast.success(`Saved ${data.saved ?? mappings.length} mappings`)
      await loadConnection()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save mappings failed')
    } finally {
      setBusy(false)
    }
  }

  const matchBySku = async (apply: boolean) => {
    setBusy(true)
    try {
      const res = await fetch(
        `/api/admin/clients/${clientId}/shopify/mappings/match-sku?apply=${apply ? '1' : '0'}`,
        { method: 'POST' }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Match failed')
      if (!apply) {
        const next = { ...draftMaps }
        for (const s of data.suggestions ?? []) {
          next[s.shopifyVariantId] = s.variantId
        }
        setDraftMaps(next)
        toast.success(`Suggested ${data.matched ?? 0} SKU matches`)
      } else {
        toast.success(`Applied ${data.matched ?? 0} SKU matches`)
        await loadMappings()
        await loadConnection()
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Match failed')
    } finally {
      setBusy(false)
    }
  }

  const copyWebhook = async () => {
    if (!connection?.webhookUrl) return
    await navigator.clipboard.writeText(connection.webhookUrl)
    toast.success('Webhook URL copied')
  }

  const mappedCount = useMemo(
    () => Object.values(draftMaps).filter(Boolean).length,
    [draftMaps]
  )

  if (loading) {
    return (
      <Card className="rounded-2xl border-white/10 bg-white/5">
        <CardContent className="flex items-center gap-2 p-6 text-white/60">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading Shopify…
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="rounded-2xl border-white/10 bg-white/5">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-white">
              <ShoppingBag className="h-5 w-5" />
              Shopify fulfillment
            </CardTitle>
            <CardDescription className="mt-1 text-white/50">
              Paid Shopify orders create a PeptSci invoice at this client&apos;s pricing, charge the
              card on file, then queue fulfillment. Unmapped products wait here to be matched.
            </CardDescription>
          </div>
          {connection && (
            <Badge
              className={
                connection.status === 'ACTIVE'
                  ? 'border-green-500/30 bg-green-500/10 text-green-400'
                  : 'border-white/20 bg-white/5 text-white/60'
              }
            >
              {connection.status}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className={labelClass}>Shop domain</Label>
            <Input
              className={inputClass}
              placeholder="client.myshopify.com"
              value={shopDomain}
              onChange={(e) => setShopDomain(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label className={labelClass}>
              Admin API access token {connection ? '(leave blank to keep)' : ''}
            </Label>
            <Input
              className={inputClass}
              type="password"
              autoComplete="off"
              placeholder="shpat_…"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label className={labelClass}>
              Webhook signing secret {connection ? '(leave blank to keep)' : ''}
            </Label>
            <Input
              className={inputClass}
              type="password"
              autoComplete="off"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/70 space-y-2">
          <p className="font-medium text-white/90">Custom App setup</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Shopify admin → Settings → Apps → Develop apps → Create app</li>
            <li>
              Scopes: <code className="text-xs">read_orders</code>,{' '}
              <code className="text-xs">write_orders</code>,{' '}
              <code className="text-xs">read_products</code>,{' '}
              <code className="text-xs">write_merchant_managed_fulfillment_orders</code>
            </li>
            <li>
              Webhooks (API version 2025-10): <code className="text-xs">orders/paid</code>,{' '}
              <code className="text-xs">orders/cancelled</code> → URL below
            </li>
          </ol>
          {connection?.webhookUrl && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <code className="flex-1 break-all rounded-lg bg-white/5 px-3 py-2 text-xs text-emerald-300">
                {connection.webhookUrl}
              </code>
              <Button type="button" variant="outline" size="sm" onClick={copyWebhook}>
                <Copy className="mr-1 h-3.5 w-3.5" /> Copy
              </Button>
            </div>
          )}
          {connection?.lastError && (
            <p className="text-amber-400 text-xs mt-2">Last error: {connection.lastError}</p>
          )}
          {connection?.lastWebhookAt && (
            <p className="text-white/40 text-xs">
              Last webhook: {new Date(connection.lastWebhookAt).toLocaleString()}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={saveConnection} disabled={busy || !shopDomain.trim()}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {connection ? 'Update connection' : 'Connect Shopify'}
          </Button>
          {connection && (
            <Button type="button" variant="destructive" onClick={disconnect} disabled={busy}>
              <Trash2 className="mr-2 h-4 w-4" /> Disconnect
            </Button>
          )}
        </div>

        {connection && (
          <div className="space-y-4 border-t border-white/10 pt-6">
            <div>
              <h3 className="text-sm font-medium text-white">Needs mapping / pending invoices</h3>
              <p className="text-xs text-white/50">
                Unmapped Shopify product names from paid orders. Match each to a PeptSci SKU — when
                all lines are matched we invoice, charge the card on file, and queue fulfillment.
              </p>
            </div>
            {inbounds.length === 0 ? (
              <p className="text-sm text-white/40">No pending Shopify inbounds.</p>
            ) : (
              <div className="space-y-4">
                {inbounds.map((ib) => (
                  <div
                    key={ib.id}
                    className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm text-white">
                        <span className="font-medium">
                          {ib.shopifyOrderName || `#${ib.shopifyOrderId}`}
                        </span>
                        <span className="ml-2 text-xs text-white/50">{ib.status}</span>
                        {ib.invoice && (
                          <a
                            href={`/invoices/${ib.invoice.id}`}
                            className="ml-2 text-xs text-brand-primary underline"
                          >
                            Invoice #{ib.invoice.invoiceNumber} ({ib.invoice.status})
                          </a>
                        )}
                      </div>
                      {(ib.status === 'READY' || ib.status === 'INVOICED') && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => reprocessInbound(ib.id)}
                        >
                          Retry charge / process
                        </Button>
                      )}
                    </div>
                    {ib.lastError && (
                      <p className="text-xs text-amber-400">{ib.lastError}</p>
                    )}
                    <ul className="space-y-2">
                      {ib.lines.map((line) => (
                        <li
                          key={line.id}
                          className="flex flex-col gap-2 rounded-lg border border-white/5 p-3 sm:flex-row sm:items-center"
                        >
                          <div className="flex-1 text-sm">
                            <p className="text-white font-medium">{line.shopifyTitle}</p>
                            <p className="text-xs text-white/50">
                              qty {line.quantity}
                              {line.shopifySku ? ` · SKU ${line.shopifySku}` : ''}
                              {line.mappedLabel ? ` · → ${line.mappedLabel}` : ' · unmapped'}
                            </p>
                          </div>
                          {!line.variantId && (
                            <div className="flex flex-wrap items-center gap-2">
                              <select
                                className={`${selectClass} min-w-[200px]`}
                                value={lineDrafts[line.id] || ''}
                                onChange={(e) =>
                                  setLineDrafts((prev) => ({
                                    ...prev,
                                    [line.id]: e.target.value,
                                  }))
                                }
                              >
                                <option value="">— match to PeptSci —</option>
                                {peptsciVariants.map((pv) => (
                                  <option key={pv.id} value={pv.id}>
                                    {pv.label}
                                  </option>
                                ))}
                              </select>
                              <Button
                                type="button"
                                size="sm"
                                disabled={busy || !lineDrafts[line.id]}
                                onClick={() => matchInboundLine(ib.id, line.id)}
                              >
                                Save match
                              </Button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {connection && (
          <div className="space-y-4 border-t border-white/10 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-medium text-white">Variant mappings</h3>
                <p className="text-xs text-white/50">
                  {mappedCount} mapped · {connection.mappingCount ?? 0} saved
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy || mapsLoading}
                  onClick={() => matchBySku(false)}
                >
                  Suggest by SKU
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy || mapsLoading}
                  onClick={() => matchBySku(true)}
                >
                  Apply SKU matches
                </Button>
                <Button type="button" size="sm" disabled={busy || mapsLoading} onClick={saveMappings}>
                  Save mappings
                </Button>
              </div>
            </div>

            {mapsLoading ? (
              <div className="flex items-center gap-2 text-white/50 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading catalog…
              </div>
            ) : shopifyVariants.length === 0 ? (
              <div className="space-y-1 text-sm">
                <p className="text-white/50">
                  No Shopify variants returned. Check token scopes (<code>read_products</code>) and
                  shop domain.
                </p>
                {catalogError && (
                  <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 break-all">
                    Shopify error: {catalogError}
                  </p>
                )}
              </div>
            ) : (
              <div className="max-h-80 overflow-auto rounded-xl border border-white/10">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-black/60 text-white/60">
                    <tr>
                      <th className="px-3 py-2 font-medium">Shopify</th>
                      <th className="px-3 py-2 font-medium">SKU</th>
                      <th className="px-3 py-2 font-medium">PeptSci variant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shopifyVariants.map((sv) => (
                      <tr key={sv.id} className="border-t border-white/5">
                        <td className="px-3 py-2 text-white/80">{sv.title || sv.id}</td>
                        <td className="px-3 py-2 font-mono text-xs text-white/60">
                          {sv.sku || '—'}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className={selectClass}
                            value={draftMaps[sv.id] || ''}
                            onChange={(e) =>
                              setDraftMaps((prev) => ({ ...prev, [sv.id]: e.target.value }))
                            }
                          >
                            <option value="">— unmapped —</option>
                            {peptsciVariants.map((pv) => (
                              <option key={pv.id} value={pv.id}>
                                {pv.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
