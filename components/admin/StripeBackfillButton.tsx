'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CreditCard, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

interface BackfillSummary {
  scanned: number
  created: number
  updated: number
  skippedOrder: number
  skippedTest: number
  skippedUnpaid: number
  failed: number
}

/** Admin "Backfill from Stripe" button — ingests historical succeeded PIs. */
export function StripeBackfillButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<BackfillSummary | null>(null)

  function openDialog() {
    setStartDate('')
    setEndDate('')
    setError(null)
    setResult(null)
    setOpen(true)
  }

  async function run() {
    setRunning(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/sales/backfill-stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirm: true,
          ...(startDate ? { startDate } : {}),
          ...(endDate ? { endDate } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || 'Backfill failed')
      setResult(data as BackfillSummary)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Backfill failed')
    } finally {
      setRunning(false)
    }
  }

  return (
    <>
      <Button
        onClick={openDialog}
        variant="outline"
        className="bg-[#0a0e3a] border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
      >
        <CreditCard className="h-4 w-4 mr-2" />
        Backfill from Stripe
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-brand-onyx border-white/10 text-white sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-white">Backfill Sales from Stripe</DialogTitle>
            <DialogDescription className="text-white/60">
              Imports succeeded payments from your connected Stripe account into sales analytics.
              Payments already tied to a platform order are skipped. Safe to re-run (deduped by
              payment). Leave dates blank to scan everything.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {result ? (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-green-300">
                <CheckCircle2 className="h-5 w-5" />
                <span>
                  Done — {result.created} added, {result.updated} updated.
                </span>
              </div>
              <ul className="text-sm text-white/60 space-y-1">
                <li>Scanned: {result.scanned}</li>
                <li>Skipped (already an order): {result.skippedOrder}</li>
                <li>Skipped (test/unpaid): {result.skippedTest + result.skippedUnpaid}</li>
                {result.failed > 0 && <li className="text-amber-300">Failed: {result.failed}</li>}
              </ul>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 py-2">
              <div className="space-y-1">
                <Label className="text-white/70">Start date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-[#0a0e3a] border-white/10 text-white"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-white/70">End date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-[#0a0e3a] border-white/10 text-white"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            {result ? (
              <Button
                onClick={() => setOpen(false)}
                className="bg-brand-primary hover:bg-[#1a30c0] text-white"
              >
                Done
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
                  {running ? 'Importing...' : 'Run Backfill'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
