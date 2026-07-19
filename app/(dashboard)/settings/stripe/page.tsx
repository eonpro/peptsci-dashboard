'use client'

import { useCallback, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle2, XCircle, RefreshCw, Beaker, Database } from 'lucide-react'

interface Diagnostics {
  config?: {
    isConfigured?: boolean
    isTestMode?: boolean
    accountId?: string
    accountName?: string
    connectedAccountId?: string
    connectEnabled?: boolean
    error?: string
  }
  environment?: {
    hasSecretKey?: boolean
    hasPublishableKey?: boolean
    hasWebhookSecret?: boolean
    keyFormat?: string | null
  }
  connectivity?: { canConnect?: boolean; latencyMs?: number; error?: string }
}

interface TestResult {
  success?: boolean
  message?: string
  connectEnabled?: boolean
  connectedAccountId?: string | null
  paymentIntentId?: string
  amount?: number
  applicationFeeAmount?: number
  statusOnCreate?: string
  canceled?: boolean
  livemode?: boolean
  latencyMs?: number
}

interface MigrateSchema {
  paymentMethodTable?: boolean
  webhookEventTable?: boolean
  orderShippingTotalColumn?: boolean
  clientStripeCustomerIdColumn?: boolean
}

interface MigrateResult {
  success?: boolean
  upToDate?: boolean
  durationMs?: number
  migrations?: string[]
  schema?: MigrateSchema
  results?: Array<{
    migration: string
    statements: number
    applied: number
    skipped: number
    error?: string
  }>
}

function Row({ label, value, ok }: { label: string; value: React.ReactNode; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 py-2 text-sm">
      <span className="text-white/60">{label}</span>
      <span className="flex items-center gap-2 font-medium text-white">
        {ok === true && <CheckCircle2 className="h-4 w-4 text-green-400" />}
        {ok === false && <XCircle className="h-4 w-4 text-red-400" />}
        {value}
      </span>
    </div>
  )
}

export default function StripeSettingsPage() {
  const [diag, setDiag] = useState<Diagnostics | null>(null)
  const [diagLoading, setDiagLoading] = useState(false)
  const [diagError, setDiagError] = useState<string | null>(null)

  const [test, setTest] = useState<TestResult | null>(null)
  const [testLoading, setTestLoading] = useState(false)
  const [testError, setTestError] = useState<string | null>(null)

  const loadDiagnostics = useCallback(async () => {
    setDiagLoading(true)
    setDiagError(null)
    try {
      const res = await fetch('/api/stripe/diagnostics')
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to load diagnostics')
      setDiag(data.data ?? data)
    } catch (e) {
      setDiagError(e instanceof Error ? e.message : 'Failed to load diagnostics')
    } finally {
      setDiagLoading(false)
    }
  }, [])

  const [migrate, setMigrate] = useState<MigrateResult | null>(null)
  const [migrateLoading, setMigrateLoading] = useState(false)
  const [migrateError, setMigrateError] = useState<string | null>(null)
  const [migrateArmed, setMigrateArmed] = useState(false)

  const checkSchema = useCallback(async () => {
    setMigrateLoading(true)
    setMigrateError(null)
    try {
      const res = await fetch('/api/admin/db/migrate')
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || data.error || 'Schema check failed')
      setMigrate(data.data ?? data)
    } catch (e) {
      setMigrateError(e instanceof Error ? e.message : 'Schema check failed')
    } finally {
      setMigrateLoading(false)
    }
  }, [])

  // Two-step confirmation without a blocking window.confirm() (which Chrome
  // flags as an INP/main-thread-blocking issue): first click arms, second runs.
  const armApply = useCallback(() => {
    setMigrateError(null)
    setMigrateArmed(true)
    window.setTimeout(() => setMigrateArmed(false), 6000)
  }, [])

  const applyMigrations = useCallback(async () => {
    setMigrateArmed(false)
    setMigrateLoading(true)
    setMigrateError(null)
    try {
      const res = await fetch('/api/admin/db/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || data.error || 'Migration run failed')
      setMigrate(data.data ?? data)
    } catch (e) {
      setMigrateError(e instanceof Error ? e.message : 'Migration run failed')
    } finally {
      setMigrateLoading(false)
    }
  }, [])

  const runSmokeTest = useCallback(async () => {
    setTestLoading(true)
    setTestError(null)
    setTest(null)
    try {
      const res = await fetch('/api/stripe/test-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountCents: 100 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || data.error || 'Smoke test failed')
      setTest(data.data ?? data)
    } catch (e) {
      setTestError(e instanceof Error ? e.message : 'Smoke test failed')
    } finally {
      setTestLoading(false)
    }
  }, [])

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Payments (Stripe)</h1>
        <p className="mt-1 text-sm text-white/50">
          Connect platform → connected account diagnostics. The smoke test creates an unconfirmed
          PaymentIntent on the connected account and immediately cancels it — no money moves.
        </p>
      </div>

      {/* Diagnostics */}
      <Card className="border-white/10 bg-white/5 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium text-white">Configuration & connectivity</h2>
          <Button
            onClick={loadDiagnostics}
            disabled={diagLoading}
            variant="outline"
            className="border-white/15 bg-transparent text-white hover:bg-white/10"
          >
            {diagLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>

        {diagError && (
          <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {diagError}
          </div>
        )}

        {diag ? (
          <div className="space-y-0.5">
            <Row label="Configured" value={String(diag.config?.isConfigured ?? false)} ok={diag.config?.isConfigured} />
            <Row label="Mode" value={diag.config?.isTestMode ? 'TEST' : 'LIVE'} />
            <Row label="Key format" value={diag.environment?.keyFormat ?? '—'} />
            <Row label="Platform account" value={diag.config?.accountId ?? '—'} />
            <Row
              label="Connect enabled"
              value={String(diag.config?.connectEnabled ?? false)}
              ok={diag.config?.connectEnabled}
            />
            <Row label="Connected account" value={diag.config?.connectedAccountId ?? '—'} />
            <Row label="Secret key" value={diag.environment?.hasSecretKey ? 'set' : 'missing'} ok={diag.environment?.hasSecretKey} />
            <Row label="Publishable key" value={diag.environment?.hasPublishableKey ? 'set' : 'missing'} ok={diag.environment?.hasPublishableKey} />
            <Row label="Webhook secret" value={diag.environment?.hasWebhookSecret ? 'set' : 'missing'} ok={diag.environment?.hasWebhookSecret} />
            <Row
              label="Connectivity"
              value={
                diag.connectivity?.canConnect
                  ? `OK (${diag.connectivity?.latencyMs}ms)`
                  : (diag.connectivity?.error ?? 'cannot connect')
              }
              ok={diag.connectivity?.canConnect}
            />
          </div>
        ) : (
          <p className="text-sm text-white/40">Click Refresh to load diagnostics.</p>
        )}
      </Card>

      {/* Smoke test */}
      <Card className="border-white/10 bg-white/5 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium text-white">Connect smoke test</h2>
          <Button
            onClick={runSmokeTest}
            disabled={testLoading}
            className="bg-brand-primary text-white hover:bg-[#1a30c0]"
          >
            {testLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Beaker className="mr-2 h-4 w-4" />
            )}
            Run test ($1, auto-canceled)
          </Button>
        </div>

        {testError && (
          <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {testError}
          </div>
        )}

        {test && (
          <div className="space-y-0.5">
            <Row label="Result" value={test.success ? 'Success' : 'Failed'} ok={test.success} />
            <Row label="Connected account" value={test.connectedAccountId ?? '(platform)'} />
            <Row label="PaymentIntent" value={test.paymentIntentId ?? '—'} />
            <Row label="Status on create" value={test.statusOnCreate ?? '—'} />
            <Row label="Canceled" value={String(test.canceled ?? false)} ok={test.canceled} />
            <Row label="Application fee" value={`${(test.applicationFeeAmount ?? 0) / 100} USD`} />
            <Row label="Live mode" value={String(test.livemode ?? false)} />
            <Row label="Latency" value={`${test.latencyMs ?? 0}ms`} />
            {test.message && <p className="pt-2 text-xs text-white/40">{test.message}</p>}
          </div>
        )}
      </Card>

      {/* Database schema */}
      <Card className="border-white/10 bg-white/5 p-5">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-medium text-white">Database schema</h2>
          <div className="flex gap-2">
            <Button
              onClick={checkSchema}
              disabled={migrateLoading}
              variant="outline"
              className="border-white/15 bg-transparent text-white hover:bg-white/10"
            >
              {migrateLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Database className="mr-2 h-4 w-4" />
              )}
              Check
            </Button>
            <Button
              onClick={migrateArmed ? applyMigrations : armApply}
              disabled={migrateLoading}
              className={
                migrateArmed
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-brand-primary text-white hover:bg-[#1a30c0]'
              }
            >
              {migrateLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {migrateArmed ? 'Confirm — apply to production' : 'Apply pending migrations'}
            </Button>
          </div>
        </div>
        <p className="mb-3 text-xs text-white/40">
          Applies the SQL migrations through the live runtime connection (the build can&apos;t run
          them under RDS IAM auth). Idempotent — safe to run more than once.
        </p>

        {migrateError && (
          <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {migrateError}
          </div>
        )}

        {migrate && (
          <div className="space-y-0.5">
            <Row
              label="Up to date"
              value={String(migrate.upToDate ?? false)}
              ok={migrate.upToDate}
            />
            <Row label="PaymentMethod table" value={String(migrate.schema?.paymentMethodTable ?? false)} ok={migrate.schema?.paymentMethodTable} />
            <Row label="WebhookEvent table" value={String(migrate.schema?.webhookEventTable ?? false)} ok={migrate.schema?.webhookEventTable} />
            <Row label="Order.shippingTotal" value={String(migrate.schema?.orderShippingTotalColumn ?? false)} ok={migrate.schema?.orderShippingTotalColumn} />
            <Row label="Client.stripeCustomerId" value={String(migrate.schema?.clientStripeCustomerIdColumn ?? false)} ok={migrate.schema?.clientStripeCustomerIdColumn} />
            {migrate.results && migrate.results.length > 0 && (
              <div className="pt-3">
                <p className="mb-1 text-xs uppercase tracking-wide text-white/40">Run details</p>
                {migrate.results.map((r) => (
                  <Row
                    key={r.migration}
                    label={r.migration}
                    value={
                      r.error
                        ? `error: ${r.error}`
                        : `${r.applied} applied, ${r.skipped} skipped / ${r.statements}`
                    }
                    ok={!r.error}
                  />
                ))}
              </div>
            )}
            {typeof migrate.durationMs === 'number' && (
              <Row label="Duration" value={`${migrate.durationMs}ms`} />
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
