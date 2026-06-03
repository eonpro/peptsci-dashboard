'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Building2, Search, Loader2, ChevronRight } from 'lucide-react'

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
  APPROVED: 'border-green-500/30 text-green-700 bg-green-50',
  PENDING: 'border-amber-500/30 text-amber-700 bg-amber-50',
  NEEDS_INFO: 'border-amber-500/30 text-amber-700 bg-amber-50',
  REJECTED: 'border-red-500/30 text-red-700 bg-red-50',
}

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    fetch('/api/admin/clients')
      .then((r) => (r.ok ? r.json() : { clients: [] }))
      .then((data) => setClients(data.clients ?? []))
      .catch(() => {})
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-7 w-7" /> Clients
          </h1>
          <p className="text-muted-foreground mt-1">
            Practice accounts, NPI verification, and approvals
          </p>
        </div>
        {pending > 0 && (
          <Badge className="border-amber-500/30 text-amber-700 bg-amber-50">
            {pending} pending approval
          </Badge>
        )}
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle>All Clients ({clients.length})</CardTitle>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name, NPI, contact…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No clients found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Practice</TableHead>
                  <TableHead>Provider / NPI</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Orders</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer">
                    <TableCell className="font-medium">
                      <Link href={`/clients/${c.id}`} className="hover:underline">
                        {c.organizationName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{c.providerName ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{c.npiNumber ?? 'No NPI'}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{c.contactName ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{c.contactEmail ?? ''}</div>
                    </TableCell>
                    <TableCell>{c.orderCount}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={statusStyles[c.onboardingStatus] ?? ''}
                      >
                        {c.onboardingStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/clients/${c.id}`}
                        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
                      >
                        Manage <ChevronRight className="h-4 w-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
