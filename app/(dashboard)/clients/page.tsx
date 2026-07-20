'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Building2, Search, Loader2, ChevronRight, Plus } from 'lucide-react'
import { toast } from 'sonner'
import AddClientDialog from './AddClientDialog'
import DeleteClientButton from './DeleteClientButton'
import { apiError } from '@/lib/api-error'

interface ClientRow {
  id: string
  organizationName: string
  npiNumber: string | null
  providerName: string | null
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  onboardingStatus: string
  orderCount: number
}

const statusStyles: Record<string, string> = {
  APPROVED: 'border-green-500/30 text-green-400 bg-green-500/10',
  PENDING: 'border-amber-500/30 text-amber-400 bg-amber-500/10',
  NEEDS_INFO: 'border-amber-500/30 text-amber-400 bg-amber-500/10',
  REJECTED: 'border-red-500/30 text-red-400 bg-red-500/10',
}

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [addOpen, setAddOpen] = useState(false)

  useEffect(() => {
    fetch('/api/admin/clients')
      .then(async (r) => {
        if (!r.ok) throw await apiError(r, 'Failed to load clients')
        return r.json()
      })
      .then((data) => setClients(data.clients ?? []))
      .catch((e) =>
        toast.error(e instanceof Error ? `${e.message} — refresh to retry` : 'Failed to load clients — refresh to retry')
      )
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return clients
    return clients.filter((c) =>
      [c.organizationName, c.providerName, c.npiNumber, c.contactName, c.contactEmail]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q))
    )
  }, [clients, query])

  const pending = clients.filter((c) => c.onboardingStatus === 'PENDING').length

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Building2 className="h-6 w-6" /> Clients
          </h1>
          <p className="text-white/60 text-sm">
            Practice accounts, NPI verification, and approvals
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pending > 0 && (
            <Badge variant="outline" className={statusStyles.PENDING}>
              {pending} pending approval
            </Badge>
          )}
          <Button
            onClick={() => setAddOpen(true)}
            className="bg-brand-primary hover:bg-[#1a30c0] text-white"
          >
            <Plus className="h-4 w-4 mr-2" /> Add Client
          </Button>
        </div>
      </div>

      <Card className="bg-[#0a0e3a]/50 border-white/10 overflow-hidden">
        <CardHeader className="bg-brand-onyx/50 border-b border-white/10">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-brand-primary/20 p-2 rounded-lg">
                <Building2 className="h-5 w-5 text-brand-primary" />
              </div>
              <div>
                <CardTitle className="text-white">All Clients</CardTitle>
                <CardDescription className="text-white/50">
                  {clients.length} total
                </CardDescription>
              </div>
            </div>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
              <Input
                placeholder="Search name, NPI, contact…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-10 bg-[#0a0e3a] border-white/10 text-white placeholder:text-white/40"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-white/60">
              <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading clients…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-white/50">
              <Building2 className="h-8 w-8 mb-3 text-white/30" />
              No clients found.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-white/60">Practice</TableHead>
                  <TableHead className="text-white/60">Provider / NPI</TableHead>
                  <TableHead className="text-white/60">Contact</TableHead>
                  <TableHead className="text-white/60">Orders</TableHead>
                  <TableHead className="text-white/60">Status</TableHead>
                  <TableHead className="text-white/60 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id} className="border-white/5 hover:bg-white/5">
                    <TableCell className="font-medium">
                      <Link href={`/clients/${c.id}`} className="text-white hover:underline">
                        {c.organizationName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-white/80">{c.providerName ?? '—'}</div>
                      <div className="text-xs text-white/40">{c.npiNumber ?? 'No NPI'}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-white/80">{c.contactName ?? '—'}</div>
                      <div className="text-xs text-white/40">{c.contactEmail ?? ''}</div>
                    </TableCell>
                    <TableCell className="text-white/80">{c.orderCount}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusStyles[c.onboardingStatus] ?? ''}>
                        {c.onboardingStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-2">
                        <DeleteClientButton
                          clientId={c.id}
                          organizationName={c.organizationName}
                          orderCount={c.orderCount}
                          onDeleted={(id) => setClients((prev) => prev.filter((x) => x.id !== id))}
                        />
                        <Link
                          href={`/clients/${c.id}`}
                          className="inline-flex items-center text-sm text-white/60 hover:text-white"
                        >
                          Manage <ChevronRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AddClientDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  )
}
