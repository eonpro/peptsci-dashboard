'use client'

/**
 * Stock count dialog — paste a physical count ("BPC-157 5mg: 126", one or
 * more per line), preview every change against the live catalog, then apply
 * it in one transaction. Lines the matcher can't resolve on its own (no size
 * for a multi-size product, two items with one size, a product listed twice,
 * an unknown name) block the apply until the text names the size or SKU.
 */

import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ApiError, apiError } from '@/lib/api-error'
import {
  toApplyLines,
  type StockCountLineStatus,
  type StockCountPreview,
  type StockCountPreviewLine,
} from '@/lib/inventory/stock-count-core'
import type { StockCountResult } from '@/lib/inventory/stock-count'

const PLACEHOLDER = `BPC-157 5mg: 126 vials
GLP-RT 10mg: 189
NAD 500mg: 100 vials NAD 1000mg: 136 vials
TR30: 230`

const STATUS_BADGE: Record<
  StockCountLineStatus,
  { label: string; variant: BadgeProps['variant'] }
> = {
  ready: { label: 'Update', variant: 'default' },
  unchanged: { label: 'No change', variant: 'secondary' },
  ambiguous: { label: 'Needs size / SKU', variant: 'warning' },
  unmatched: { label: 'Not found', variant: 'destructive' },
  duplicate: { label: 'Listed twice', variant: 'destructive' },
}

function isApplicable(line: StockCountPreviewLine): boolean {
  return line.status === 'ready' || line.status === 'unchanged'
}

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n)
}

function deltaClass(n: number): string {
  if (n > 0) return 'text-emerald-600 dark:text-emerald-400'
  if (n < 0) return 'text-red-600 dark:text-red-400'
  return 'text-muted-foreground'
}

interface StockCountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Refresh the workspace after a count is applied. */
  onApplied: () => void
}

export default function StockCountDialog({ open, onOpenChange, onApplied }: StockCountDialogProps) {
  const [step, setStep] = useState<'edit' | 'preview' | 'done'>('edit')
  const [text, setText] = useState('')
  const [countedOn, setCountedOn] = useState(localToday)
  const [note, setNote] = useState('')
  const [zeroUnlisted, setZeroUnlisted] = useState(false)
  const [preview, setPreview] = useState<StockCountPreview | null>(null)
  const [buds, setBuds] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null)
  const [result, setResult] = useState<StockCountResult | null>(null)

  function reset() {
    setStep('edit')
    setText('')
    setCountedOn(localToday())
    setNote('')
    setZeroUnlisted(false)
    setPreview(null)
    setBuds({})
    setResult(null)
  }

  function handleOpenChange(next: boolean) {
    // Keep a pasted-but-unapplied list across an accidental close.
    if (!next && step === 'done') reset()
    onOpenChange(next)
  }

  async function runPreview() {
    setBusy('preview')
    try {
      const res = await fetch('/api/admin/inventory/stock-count/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, zeroUnlisted }),
      })
      if (!res.ok) throw await apiError(res, 'Could not preview the count')
      setPreview((await res.json()).preview)
      setStep('preview')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not preview the count')
    } finally {
      setBusy(null)
    }
  }

  async function applyCount() {
    if (!preview) return
    setBusy('apply')
    try {
      const lines = toApplyLines(preview).map((l) =>
        buds[l.variantId] ? { ...l, newBatchBud: buds[l.variantId] } : l
      )
      const res = await fetch('/api/admin/inventory/stock-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines, countedOn, note: note.trim() || undefined }),
      })
      if (!res.ok) throw await apiError(res, 'Could not apply the count')
      setResult((await res.json()).result)
      setStep('done')
      onApplied()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'STOCK_CHANGED') {
        toast.warning(`${err.message} The preview now shows the current numbers.`)
        await runPreview()
        return
      }
      toast.error(err instanceof Error ? err.message : 'Could not apply the count')
    } finally {
      setBusy(null)
    }
  }

  const blocked = preview?.lines.filter((l) => !isApplicable(l)) ?? []
  const toUpdate = preview?.totals.ready ?? 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-6xl flex-col">
        <DialogHeader>
          <DialogTitle>Stock count</DialogTitle>
          <DialogDescription>
            Paste the physical count — one product per line as &quot;Product size: count&quot; (a
            SKU works too). Every change is previewed before anything is saved, and on-hand,
            batches, and the activity log update together.
          </DialogDescription>
        </DialogHeader>

        {step === 'edit' && (
          <div className="grid min-h-0 gap-4 overflow-y-auto">
            <Textarea
              aria-label="Counted stock"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={PLACEHOLDER}
              rows={14}
              className="font-mono text-sm"
            />
            <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
              <div>
                <Label htmlFor="count-date">Counted on</Label>
                <Input
                  id="count-date"
                  type="date"
                  value={countedOn}
                  max={localToday()}
                  onChange={(e) => setCountedOn(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="count-note">Note (optional)</Label>
                <Input
                  id="count-note"
                  value={note}
                  maxLength={500}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Monthly shelf count — Tampa"
                />
              </div>
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm">
              <Switch checked={zeroUnlisted} onCheckedChange={setZeroUnlisted} className="mt-0.5" />
              <span>
                <span className="font-medium">Set products not on this list to 0</span>
                <span className="block text-xs text-muted-foreground">
                  For a full wall-to-wall count. Off: products you didn&apos;t list keep their
                  current stock (the preview lists them).
                </span>
              </span>
            </label>
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="grid min-h-0 gap-4 overflow-y-auto pr-1">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline">{preview.totals.entries} lines</Badge>
              <Badge>{toUpdate} to update</Badge>
              <Badge variant="secondary">{preview.totals.unchanged} unchanged</Badge>
              {preview.totals.blocked > 0 && (
                <Badge variant="destructive">{preview.totals.blocked} need attention</Badge>
              )}
              <span className="text-muted-foreground">
                Vials on these lines: {preview.totals.unitsBefore.toLocaleString()} →{' '}
                <span className="font-semibold text-foreground">
                  {preview.totals.unitsAfter.toLocaleString()}
                </span>{' '}
                (
                <span className={deltaClass(preview.totals.netChange)}>
                  {signed(preview.totals.netChange)}
                </span>
                )
              </span>
            </div>

            {(preview.issues.length > 0 || blocked.length > 0) && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
                <p className="mb-1.5 flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="h-4 w-4" />
                  Fix these in the list, then preview again — nothing is saved until every line is
                  clear.
                </p>
                <ul className="space-y-1">
                  {preview.issues.map((issue, i) => (
                    <li key={`issue-${i}`}>
                      {issue.line > 0 ? `Line ${issue.line}: ` : ''}
                      {issue.message}
                    </li>
                  ))}
                  {blocked.map((l) => (
                    <li key={l.key}>
                      Line {l.entry?.line} &quot;{l.entry?.label}&quot;: {l.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Line</TableHead>
                  <TableHead>Catalog item</TableHead>
                  <TableHead className="text-right">System</TableHead>
                  <TableHead className="text-right">Counted</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead>Batches</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.lines.map((l) => (
                  <PreviewRow
                    key={l.key}
                    line={l}
                    bud={l.variant ? (buds[l.variant.variantId] ?? '') : ''}
                    onBud={(value) =>
                      l.variant && setBuds((prev) => ({ ...prev, [l.variant!.variantId]: value }))
                    }
                  />
                ))}
              </TableBody>
            </Table>

            {preview.unlisted.length > 0 && (
              <details className="rounded-lg border p-3 text-sm">
                <summary className="cursor-pointer font-medium">
                  {preview.unlisted.length} product{preview.unlisted.length === 1 ? '' : 's'} with
                  stock {preview.unlisted.length === 1 ? 'is' : 'are'} not on this list and stay
                  unchanged
                </summary>
                <ul className="mt-2 grid gap-1 text-muted-foreground sm:grid-cols-2">
                  {preview.unlisted.map((u) => (
                    <li key={u.variantId}>
                      {u.name} {u.dose}
                      {u.sku ? <span className="font-mono text-xs"> · {u.sku}</span> : null} —{' '}
                      {u.onHand} on hand
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {step === 'done' && result && (
          <div className="grid gap-4 text-sm">
            <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <div>
                <p className="font-semibold">Stock count applied</p>
                <p className="text-muted-foreground">
                  {result.lines} products counted · {result.changed} updated · vials{' '}
                  {result.unitsBefore.toLocaleString()} → {result.unitsAfter.toLocaleString()} (
                  <span className={deltaClass(result.netChange)}>{signed(result.netChange)}</span>)
                  · {result.batchesAdjusted} batch adjustment
                  {result.batchesAdjusted === 1 ? '' : 's'}
                  {result.batchesCreated > 0 ? ` · ${result.batchesCreated} new batch(es)` : ''} ·
                  ref <span className="font-mono">{result.countId.slice(0, 8)}</span>
                </p>
              </div>
            </div>
            {result.unbatched.length > 0 && (
              <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-amber-800 dark:text-amber-300">
                <p className="mb-1 font-semibold">Counted vials with no usable batch</p>
                <p className="mb-2 text-xs">
                  Vial labels and FedEx stock checks can&apos;t draw these until they belong to a
                  batch with a BUD. Run a count for just these lines and enter their BUD.
                </p>
                <ul className="space-y-0.5">
                  {result.unbatched.map((u) => (
                    <li key={u.variantId}>
                      {u.name} {u.dose}
                      {u.sku ? <span className="font-mono text-xs"> · {u.sku}</span> : null} —{' '}
                      {u.units}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === 'edit' && (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => void runPreview()} disabled={!text.trim() || busy !== null}>
                {busy === 'preview' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Preview
              </Button>
            </>
          )}
          {step === 'preview' && preview && (
            <>
              <Button variant="outline" onClick={() => setStep('edit')} disabled={busy !== null}>
                Edit list
              </Button>
              <Button
                onClick={() => void applyCount()}
                disabled={!preview.canApply || busy !== null}
              >
                {busy === 'apply' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {preview.canApply
                  ? `Apply count (${toUpdate} update${toUpdate === 1 ? '' : 's'})`
                  : 'Fix the lines above to apply'}
              </Button>
            </>
          )}
          {step === 'done' && (
            <>
              <Button variant="outline" onClick={reset}>
                New count
              </Button>
              <Button onClick={() => handleOpenChange(false)}>Close</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PreviewRow({
  line,
  bud,
  onBud,
}: {
  line: StockCountPreviewLine
  bud: string
  onBud: (value: string) => void
}) {
  const badge = STATUS_BADGE[line.status]
  const applicable = isApplicable(line)
  return (
    <TableRow className={applicable ? undefined : 'bg-red-500/[0.06]'}>
      <TableCell className="max-w-[180px] align-top">
        {line.entry ? (
          <>
            <span className="font-medium">{line.entry.label}</span>
            <span className="block text-xs text-muted-foreground">line {line.entry.line}</span>
          </>
        ) : (
          <span className="text-muted-foreground">Not on list → 0</span>
        )}
      </TableCell>
      <TableCell className="align-top">
        {line.variant ? (
          <>
            {line.variant.name} <span className="text-muted-foreground">{line.variant.dose}</span>
            {line.variant.sku && (
              <span className="block font-mono text-xs text-muted-foreground">
                {line.variant.sku}
              </span>
            )}
          </>
        ) : line.candidates.length > 0 ? (
          <ul className="text-xs text-muted-foreground">
            {line.candidates.map((c) => (
              <li key={c.variantId}>
                {c.name} {c.dose}
                {c.sku ? <span className="font-mono"> · {c.sku}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right align-top tabular-nums">{line.before ?? '—'}</TableCell>
      <TableCell className="text-right align-top font-semibold tabular-nums">
        {line.counted}
      </TableCell>
      <TableCell
        className={`text-right align-top font-semibold tabular-nums ${deltaClass(line.delta ?? 0)}`}
      >
        {line.delta === null ? '—' : line.delta === 0 ? '0' : signed(line.delta)}
      </TableCell>
      <TableCell className="align-top text-xs">
        {line.batchChanges.map((c) => (
          <span key={c.batchId} className="block font-mono">
            {c.batchNumber} {c.from}→{c.to}
          </span>
        ))}
        {line.unbatched > 0 && (
          <label className="mt-1 block">
            <span className="text-amber-700 dark:text-amber-400">
              {line.unbatched} without a batch — BUD:
            </span>
            <Input
              type="date"
              value={bud}
              onChange={(e) => onBud(e.target.value)}
              className="mt-1 h-7 w-[140px] text-xs"
              aria-label={`BUD for a new batch of ${line.variant?.name ?? 'this product'}`}
            />
          </label>
        )}
        {applicable && line.batchChanges.length === 0 && line.unbatched === 0 && (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="max-w-[300px] align-top text-xs">
        <Badge variant={badge.variant} className="mb-1">
          {badge.label}
        </Badge>
        {line.message && <p className="text-red-700 dark:text-red-300">{line.message}</p>}
        {line.warnings.map((w) => (
          <p key={w} className="text-amber-700 dark:text-amber-400">
            {w}
          </p>
        ))}
      </TableCell>
    </TableRow>
  )
}
