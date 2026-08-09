'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Tag } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { LABEL_BRAND_OPTIONS } from '@/lib/labels/brandKeys'

type Props = {
  clientId: string
  initialEnabled?: boolean
  initialBrandKey?: string | null
  onChanged?: (next: { whiteLabelEnabled: boolean; labelBrandKey: string | null }) => void
}

/**
 * Super-admin: enable white-label vial labels for a practice and pick the brand
 * layout (Elevated Vitality pilot). Proof PDF uses the locked EV overlay map.
 */
export function ClientWhiteLabelLabelsCard({
  clientId,
  initialEnabled = false,
  initialBrandKey = null,
  onChanged,
}: Props) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [brandKey, setBrandKey] = useState<string | null>(initialBrandKey)
  const [busy, setBusy] = useState(false)
  const [proofBusy, setProofBusy] = useState(false)

  useEffect(() => {
    setEnabled(initialEnabled)
    setBrandKey(initialBrandKey)
  }, [initialEnabled, initialBrandKey])

  const save = useCallback(
    async (next: { whiteLabelEnabled?: boolean; labelBrandKey?: string | null }) => {
      setBusy(true)
      try {
        const res = await fetch(`/api/admin/clients/${clientId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(json?.error || json?.message || 'Failed to save')
        }
        const savedEnabled = json?.data?.whiteLabelEnabled ?? next.whiteLabelEnabled ?? enabled
        const savedBrand =
          json?.data?.labelBrandKey !== undefined ? json.data.labelBrandKey : (next.labelBrandKey ?? brandKey)
        setEnabled(Boolean(savedEnabled))
        setBrandKey(savedBrand ?? null)
        onChanged?.({
          whiteLabelEnabled: Boolean(savedEnabled),
          labelBrandKey: savedBrand ?? null,
        })
        toast.success('White-label labels updated')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to save')
      } finally {
        setBusy(false)
      }
    },
    [brandKey, clientId, enabled, onChanged]
  )

  const onToggle = async (checked: boolean) => {
    if (checked && !brandKey) {
      toast.error('Select a label brand first')
      return
    }
    await save({ whiteLabelEnabled: checked, labelBrandKey: brandKey })
  }

  const onBrandChange = async (value: string) => {
    const next = value || null
    setBrandKey(next)
    await save({
      labelBrandKey: next,
      ...(enabled && !next ? { whiteLabelEnabled: false } : {}),
    })
  }

  const downloadProof = async () => {
    if (!brandKey) {
      toast.error('Select a label brand first')
      return
    }
    setProofBusy(true)
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/labels/proof`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: 'BPC-157 / TB-500',
          dose: '10mg/10mg',
          batchNumber: 'BPC-10',
          budIsoDate: '2027-07-21',
          quantity: 1,
          proofMode: true,
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error || 'Proof failed')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `white-label-proof-${brandKey}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Proof failed')
    } finally {
      setProofBusy(false)
    }
  }

  return (
    <Card className="bg-[#0a0e3a]/50 border-white/10">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Tag className="h-5 w-5 text-blue-300" />
          White-label vial labels
        </CardTitle>
        <CardDescription className="text-white/60">
          When enabled, order vial label PDFs print with this practice&apos;s brand artwork
          (OL4891LP) instead of PeptSci. Inventory batch print stays PeptSci.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="text-white">Enable white-label labels</Label>
            <p className="text-xs text-white/50 mt-1">Requires a brand layout below.</p>
          </div>
          <Switch
            checked={enabled}
            disabled={busy || (!brandKey && !enabled)}
            onCheckedChange={onToggle}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-white/70" htmlFor="label-brand">
            Label brand
          </Label>
          <select
            id="label-brand"
            className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white [&>option]:text-black"
            value={brandKey ?? ''}
            disabled={busy}
            onChange={(e) => void onBrandChange(e.target.value)}
          >
            <option value="">PeptSci (default)</option>
            {LABEL_BRAND_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <Button
          type="button"
          variant="outline"
          className="border-white/20 text-white hover:bg-white/10"
          disabled={proofBusy || !brandKey}
          onClick={() => void downloadProof()}
        >
          {proofBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Download proof PDF
        </Button>
      </CardContent>
    </Card>
  )
}
