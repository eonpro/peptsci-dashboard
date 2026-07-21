'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { PackageSearch } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '../_components/PageHeader'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface PriceRow {
  variantId: string
  sku: string | null
  name: string
  dose: string | null
  srpCents: number
  floorCents: number
  currentPriceCents: number | null
}

const usd = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

export default function PartnerPricingPage() {
  const [clinics, setClinics] = useState<Array<{ id: string; organizationName: string }>>([])
  const [clientId, setClientId] = useState('')
  const [items, setItems] = useState<PriceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const load = useCallback(async (selected: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/partners/pricing${selected ? `?clientId=${selected}` : ''}`)
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.message || 'Failed to load pricing')
        return
      }
      setClinics(data.clinics)
      setItems(data.items)
      setDrafts({})
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load('')
  }, [load])

  async function save(row: PriceRow) {
    const draft = drafts[row.variantId]
    const dollars = Number(draft)
    if (!draft || !Number.isFinite(dollars) || dollars <= 0) {
      toast.error('Enter a valid price')
      return
    }
    const priceCents = Math.round(dollars * 100)
    if (priceCents < row.floorCents) {
      toast.error(`Price can't be below your floor of ${usd(row.floorCents)}`)
      return
    }
    const res = await fetch('/api/partners/pricing', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, variantId: row.variantId, priceCents }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(data.message || 'Failed to save price')
      return
    }
    toast.success('Price saved — the clinic sees it immediately')
    void load(clientId)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clinic pricing"
        description="Set what each clinic pays per product. Your margin is the spread above your wholesale floor — earned automatically on every order."
      />

      <Select
        value={clientId || undefined}
        onValueChange={(value) => {
          setClientId(value)
          if (value) void load(value)
          else setItems([])
        }}
      >
        <SelectTrigger className="w-auto min-w-[220px] bg-white" aria-label="Clinic">
          <SelectValue placeholder="Select a clinic…" />
        </SelectTrigger>
        <SelectContent>
          {clinics.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.organizationName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {clientId && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <TableHead className="text-xs uppercase tracking-wide">Product</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wide">Your floor</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wide">List (SRP)</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wide">Clinic price</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wide">Your margin</TableHead>
                <TableHead className="text-xs uppercase tracking-wide" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading &&
                [0, 1, 2].map((i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6} className="py-3">
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              {!loading && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <EmptyState
                      icon={PackageSearch}
                      title="No products have wholesale floors set for your org yet"
                      description="Contact PeptSci."
                      className="py-6"
                    />
                  </TableCell>
                </TableRow>
              )}
              {items.map((row) => {
                const draft = drafts[row.variantId]
                const effective =
                  draft !== undefined && draft !== ''
                    ? Math.round(Number(draft) * 100)
                    : (row.currentPriceCents ?? row.srpCents)
                const margin = Number.isFinite(effective) ? effective - row.floorCents : 0
                return (
                  <TableRow key={row.variantId}>
                    <TableCell className="py-3">
                      <div className="font-medium">{row.name}</div>
                      <div className="text-xs text-slate-400">
                        {row.dose}
                        {row.sku ? ` · ${row.sku}` : ''}
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-right">{usd(row.floorCents)}</TableCell>
                    <TableCell className="py-3 text-right text-slate-500">{usd(row.srpCents)}</TableCell>
                    <TableCell className="py-3 text-right">
                      <Input
                        type="number"
                        step="0.01"
                        min={row.floorCents / 100}
                        value={draft ?? (row.currentPriceCents != null ? (row.currentPriceCents / 100).toFixed(2) : '')}
                        placeholder={(row.srpCents / 100).toFixed(2)}
                        aria-label={`Clinic price for ${row.name}`}
                        onChange={(e) => setDrafts((d) => ({ ...d, [row.variantId]: e.target.value }))}
                        className="ml-auto h-9 w-28 bg-white text-right"
                      />
                    </TableCell>
                    <TableCell
                      className={cn(
                        'py-3 text-right font-medium',
                        margin < 0 ? 'text-red-600' : 'text-emerald-600'
                      )}
                    >
                      {Number.isFinite(margin) ? usd(Math.max(0, margin)) : '—'}
                    </TableCell>
                    <TableCell className="py-3 text-right">
                      <Button
                        size="sm"
                        className="h-8 text-xs font-semibold"
                        onClick={() => void save(row)}
                        disabled={draft === undefined || draft === ''}
                      >
                        Save
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          </div>
        </Card>
      )}
    </div>
  )
}
