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
  thisMonth: string
  createdGte: string
  scanned: number
  succeededSeen: number
  succeededThisMonth: number
  created: number
  updated: number
  datesFixed: number
  syncedFromOrder: number
  failed: number
  augustBefore: { count: number; sum: number }
  augustAfter: { count: number; sum: number }
  monthPiSample: Array<{
    paymentIntentId: string
    status: string
    amount: number
    created: string
    hasSalesRecord: boolean
    dbDate: string | null
    dbAmount: number | null
    action: string
  }>
  failedSamples: Array<{ paymentIntentId: string; error: string }>
}

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
        body: JSON.stringify({ confirm: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || data?.error || 'Repair failed')
      setResult(data as RepairSummary)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Repair failed')
    } finally {
      setRunning(false)
    }
  }

  const usd = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

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
        <DialogContent className="bg-brand-onyx border-white/10 text-white sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">Repair missing Stripe sales</DialogTitle>
            <DialogDescription className="text-white/60">
              Pulls every PaymentIntent created this month on the connected account and writes /
              fixes SalesRecords. Shows each August PI so we can see succeeded vs missing.
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
                  Done — {result.created} added, {result.datesFixed} dates fixed,{' '}
                  {result.updated} updated.
                </span>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-sm">
                <p className="text-white/50 text-xs uppercase tracking-wide mb-1">
                  August revenue ({result.thisMonth})
                </p>
                <p className="text-white">
                  {usd(result.augustBefore.sum)} →{' '}
                  <span className="text-emerald-300 font-semibold">
                    {usd(result.augustAfter.sum)}
                  </span>
                  <span className="text-white/40 text-xs ml-2">
                    ({result.augustBefore.count} → {result.augustAfter.count} rows)
                  </span>
                </p>
              </div>
              <ul className="text-sm text-white/60 space-y-1">
                <li>
                  Account:{' '}
                  <span className="text-white/80 font-mono text-xs">
                    {result.connectedAccountId ?? 'none'}
                  </span>
                </li>
                <li>Scanned since {result.createdGte.slice(0, 10)}: {result.scanned}</li>
                <li>
                  Succeeded this month: {result.succeededThisMonth} (all statuses succeeded:{' '}
                  {result.succeededSeen})
                </li>
                {result.failed > 0 && (
                  <li className="text-amber-300">Failed: {result.failed}</li>
                )}
              </ul>
              {result.monthPiSample.length > 0 ? (
                <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs space-y-1 max-h-56 overflow-auto">
                  <p className="text-white/50 uppercase tracking-wide mb-1">
                    This month&apos;s PaymentIntents
                  </p>
                  {result.monthPiSample.map((s) => (
                    <div key={s.paymentIntentId} className="text-white/80 font-mono">
                      {s.created.slice(0, 16).replace('T', ' ')} · {s.status} · $
                      {s.amount.toFixed(0)}
                      {s.hasSalesRecord
                        ? ` · db ${s.dbDate?.slice(0, 10) ?? 'null'} $${s.dbAmount?.toFixed(0)}`
                        : ' · NO db row'}
                      {' · '}
                      {s.action}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  No PaymentIntents found for {result.thisMonth} on this connected account. The Aug
                  4 charge may be on a different Stripe account than{' '}
                  <span className="font-mono text-xs">{result.connectedAccountId}</span>.
                </div>
              )}
              {result.failedSamples[0] && (
                <p className="text-amber-300/80 text-xs break-all">
                  e.g. {result.failedSamples[0].paymentIntentId}: {result.failedSamples[0].error}
                </p>
              )}
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
                  window.location.href = '/dashboard'
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
