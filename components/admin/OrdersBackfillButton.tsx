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
import { RefreshCcw, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

interface BackfillSummary {
  total: number
  synced: number
  failed: number
}

/**
 * Admin "Backfill from Orders" button — mirrors every captured platform order
 * into SalesRecord. Idempotent; runs server-side so it reaches the prod DB.
 */
export function OrdersBackfillButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<BackfillSummary | null>(null)

  function openDialog() {
    setError(null)
    setResult(null)
    setOpen(true)
  }

  async function run() {
    setRunning(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/sales/backfill-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
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
        <RefreshCcw className="h-4 w-4 mr-2" />
        Backfill from Orders
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[#050722] border-white/10 text-white sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-white">Backfill Sales from Orders</DialogTitle>
            <DialogDescription className="text-white/60">
              Mirrors every captured platform order into sales analytics with real COGS. New
              captures sync automatically; use this once to import existing orders. Safe to re-run
              (deduped by order).
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {result && (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-green-300">
                <CheckCircle2 className="h-5 w-5" />
                <span>Done — {result.synced} synced.</span>
              </div>
              <ul className="text-sm text-white/60 space-y-1">
                <li>Captured orders found: {result.total}</li>
                {result.failed > 0 && <li className="text-amber-300">Failed: {result.failed}</li>}
              </ul>
            </div>
          )}

          <DialogFooter>
            {result ? (
              <Button
                onClick={() => setOpen(false)}
                className="bg-[#213cef] hover:bg-[#1a30c0] text-white"
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
                  className="bg-[#213cef] hover:bg-[#1a30c0] text-white"
                >
                  {running && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {running ? 'Syncing...' : 'Run Backfill'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
