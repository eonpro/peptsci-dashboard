'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { apiError } from '@/lib/api-error'
import {
  ArrowLeft,
  Users,
  DollarSign,
  Percent,
  Search,
  AlertCircle,
  Loader2,
  ChevronRight,
} from 'lucide-react'

interface ClientOption {
  id: string
  organizationName: string
  paysAtCost: boolean
  customPriceCount: number
}

interface ClientPricingRow {
  id: string
  clientId: string
  clientName: string
  discountPercent: number | null
}

export default function ClientPricingPage() {
  const [pricing, setPricing] = useState<ClientPricingRow[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [pRes, cRes] = await Promise.all([
        fetch('/api/admin/client-pricing'),
        fetch('/api/admin/clients'),
      ])

      if (!pRes.ok) throw await apiError(pRes, 'Failed to load client pricing')
      if (!cRes.ok) throw await apiError(cRes, 'Failed to load clients')

      const pData = await pRes.json()
      const cData = await cRes.json()

      setPricing(Array.isArray(pData) ? pData : (pData.prices ?? []))
      setClients(
        (cData.clients ?? []).map((c: ClientOption) => ({
          id: c.id,
          organizationName: c.organizationName,
          paysAtCost: Boolean(c.paysAtCost),
          customPriceCount: Number(c.customPriceCount ?? 0),
        }))
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const avgDiscount = useMemo(() => {
    const withDiscount = pricing.filter((p) => typeof p.discountPercent === 'number')
    if (withDiscount.length === 0) return 0
    return (
      withDiscount.reduce((sum, p) => sum + (p.discountPercent || 0), 0) / withDiscount.length
    )
  }, [pricing])

  const pricedClientIds = useMemo(() => new Set(pricing.map((p) => p.clientId)), [pricing])

  const filteredClients = useMemo(() => {
    const term = searchTerm.toLowerCase()
    return clients
      .filter((c) => {
        const matchesSearch = c.organizationName.toLowerCase().includes(term)
        const hasModel = c.customPriceCount > 0 || c.paysAtCost || pricedClientIds.has(c.id)
        return matchesSearch && (term ? true : hasModel)
      })
      .sort((a, b) => {
        const aCount = a.customPriceCount || (pricedClientIds.has(a.id) ? 1 : 0)
        const bCount = b.customPriceCount || (pricedClientIds.has(b.id) ? 1 : 0)
        if (bCount !== aCount) return bCount - aCount
        return a.organizationName.localeCompare(b.organizationName)
      })
  }, [clients, searchTerm, pricedClientIds])

  const atCostClients = useMemo(() => clients.filter((c) => c.paysAtCost), [clients])

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href="/pricing">
            <Button
              variant="ghost"
              size="icon"
              className="text-white/70 hover:text-white hover:bg-white/10"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Client Custom Pricing</h1>
            <p className="text-white/60 text-sm">
              Open a clinic to edit the full catalog, or copy another client&apos;s model.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-[#0a0e3a]/50 border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/60">
              Clients with Custom Pricing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-brand-primary" />
              <span className="text-2xl font-bold text-white">
                {new Set(pricing.map((p) => p.clientId)).size}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#0a0e3a]/50 border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/60">Total Custom Prices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-400" />
              <span className="text-2xl font-bold text-white">{pricing.length}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#0a0e3a]/50 border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/60">Average Discount</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Percent className="h-5 w-5 text-amber-400" />
              <span className="text-2xl font-bold text-white">{avgDiscount.toFixed(1)}%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {atCostClients.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <span className="text-sm text-amber-300/90 font-medium">Clinics paying cost:</span>
          {atCostClients.map((c) => (
            <Link key={c.id} href={`/clients/${c.id}?tab=pricing`}>
              <Badge
                variant="outline"
                className="border-amber-500/30 text-amber-400 bg-amber-500/10 hover:bg-amber-500/20"
              >
                {c.organizationName}
              </Badge>
            </Link>
          ))}
        </div>
      )}

      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
        <Input
          placeholder="Search clients..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9 bg-[#0a0e3a] border-white/10 text-white placeholder:text-white/40"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-white/60">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading pricing...
        </div>
      ) : filteredClients.length > 0 ? (
        <Card className="bg-[#0a0e3a]/50 border-white/10 overflow-hidden">
          <CardHeader className="border-b border-white/10">
            <CardTitle className="text-white">Clinics</CardTitle>
            <CardDescription className="text-white/50">
              Edit every SKU on the client profile Pricing tab. Copy another clinic&apos;s
              model from there.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-white/60">Client</TableHead>
                  <TableHead className="text-white/60 text-right">Custom SKUs</TableHead>
                  <TableHead className="text-white/60">Model</TableHead>
                  <TableHead className="text-white/60 w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client) => (
                  <TableRow key={client.id} className="border-white/5 hover:bg-white/5">
                    <TableCell>
                      <Link
                        href={`/clients/${client.id}?tab=pricing`}
                        className="text-white font-medium hover:underline"
                      >
                        {client.organizationName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-white/70 text-right">
                      {client.customPriceCount}
                    </TableCell>
                    <TableCell>
                      {client.paysAtCost ? (
                        <Badge
                          variant="outline"
                          className="border-amber-500/30 text-amber-400 bg-amber-500/10"
                        >
                          Pays cost
                        </Badge>
                      ) : client.customPriceCount > 0 ? (
                        <Badge
                          variant="outline"
                          className="border-green-500/30 text-green-400 bg-green-500/10"
                        >
                          Custom
                        </Badge>
                      ) : (
                        <span className="text-white/40 text-sm">SRP</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-white/50" asChild>
                        <Link href={`/clients/${client.id}?tab=pricing`}>
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-[#0a0e3a]/50 border-white/10">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="bg-white/5 p-4 rounded-full mb-4">
              <AlertCircle className="h-8 w-8 text-white/40" />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">No Custom Pricing Found</h3>
            <p className="text-white/50 text-center max-w-md mb-6">
              {searchTerm
                ? 'No clinics match your search.'
                : 'Open a client profile and use the Pricing tab to set offer prices on the full catalog, or copy another clinic\'s model.'}
            </p>
            <Button asChild className="bg-brand-primary hover:bg-[#1a30c0] text-white">
              <Link href="/clients">Go to clients</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
