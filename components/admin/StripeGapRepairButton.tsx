'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Wrench, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

interface RepairSummary {
  connectedAccountId: string | null
  scanned: number
  succeededSeen: number
  alreadyPresent: number
  created: number
  updated: number
  syncedFromOrder: number
  failed: number
  newestPiCreated: string | null
  ingestedSample: Array<{
    paymentIntentId: string
    amount: number
    created: string
    customer: string
  }>
  failedSamples: Array<{ paymentIntentId: string; error: string }>
}

/** One-click repair: pull newest Stripe PIs missing from SalesRecord. */
export function StripeGapRepairButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RepairSummary | null>(null)

  function openDialog() {
    setError(null)
    setResult(null)
    setOpen(true)
  }

  async function run() {
    setRunning(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/sales/repair-stripe-gap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true, maxScan: 200 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || data?.error || 'Repair failed')
      setResult(data as RepairSummary)
      router.refresh()
      // Also force a client sales reload after a short delay so KPIs update.
      setTimeout(() => {
        window.dispatchEvent(new Event('focus'))
      }, 500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Repair failed')
    } finally {
      setRunning(false)
    }
  }

  return (
    <>
      <Button
        onClick={openDialog}
        variant="outline"
        className="bg-[#0a0e3a] border-amber-500/40 text-amber-100 hover:bg-amber-500/10 hover:text-amber-50"
      >
        <Wrench className="h-4 w-4 mr-2" />
        Repair Stripe gap
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-brand-onyx border-white/10 text-white sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="text-white">Repair missing Stripe sales</DialogTitle>
            <DialogDescription className="text-white/60">
              Scans the newest ~200 payments on the connected Stripe account and writes any that are
              missing from the dashboard. Use this when a payment shows in Stripe / webhooks but
              August revenue stays at $0.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {result ? (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-green-300">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <span>
                  Done — {result.created} added, {result.syncedFromOrder} synced from orders
                  {result.updated ? `, ${result.updated} updated` : ''}.
                </span>
              </div>
              <ul className="text-sm text-white/60 space-y-1">
                <li>
                  Account:{' '}
                  <span className="text-white/80 font-mono text-xs">
                    {result.connectedAccountId ?? 'none (platform)'}
                  </span>
                </li>
                <li>Scanned: {result.scanned}</li>
                <li>Succeeded seen: {result.succeededSeen}</li>
                <li>Already in sales: {result.alreadyPresent}</li>
                <li>Newest PI: {result.newestPiCreated ?? '—'}</li>
                {result.failed > 0 && (
                  <li className="text-amber-300">Failed: {result.failed}</li>
                )}
              </ul>
              {result.ingestedSample.length > 0 && (
                <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs space-y-1 max-h-40 overflow-auto">
                  <p className="text-white/50 uppercase tracking-wide mb-1">Added / repaired</p>
                  {result.ingestedSample.map((s) => (
                    <div key={s.paymentIntentId} className="text-white/80 font-mono">
                      ${s.amount.toFixed(2)} · {s.created.slice(0, 10)} · {s.customer || s.paymentIntentId}
                    </div>
                  ))}
                </div>
              )}
              {result.failedSamples[0] && (
                <p className="text-amber-300/80 text-xs break-all">
                  e.g. {result.failedSamples[0].paymentIntentId}: {result.failedSamples[0].error}
                </p>
              )}
              <p className="text-xs text-white/40">
                Click Refresh on the dashboard after closing if August still shows $0.
              </p>
            </div>
          ) : (
            <p className="text-sm text-white/50 py-2">
              This usually takes 30–90 seconds. Safe to re-run.
            </p>
          )}

          <DialogFooter>
            {result ? (
              <Button
                onClick={() => {
                  setOpen(false)
                  window.location.reload()
                }}
                className="bg-brand-primary hover:bg-[#1a30c0] text-white"
              >
                Reload dashboard
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => setOpen(false)}
                  className="border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
                >
                  Cancel
                </Button>
                <Button
                  onClick={run}
                  disabled={running}
                  className="bg-brand-primary hover:bg-[#1a30c0] text-white"
                >
                  {running && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {running ? 'Repairing...' : 'Repair now'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
