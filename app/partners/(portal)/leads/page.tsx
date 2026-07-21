'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ShieldCheck, UserPlus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageHeader } from '../_components/PageHeader'

interface LeadRow {
  id: string
  clinicName: string
  contactName: string | null
  email: string | null
  phone: string | null
  npiNumber: string | null
  notes: string | null
  status: 'NEW' | 'WORKING' | 'CONVERTED' | 'LOST' | 'EXPIRED'
  protectedUntil: string
  createdAt: string
  rep: { id: string; name: string } | null
  matchedClient: { id: string; organizationName: string } | null
}

const STATUS_BADGE: Record<LeadRow['status'], string> = {
  NEW: 'border-blue-200 bg-blue-50 text-blue-700',
  WORKING: 'border-amber-200 bg-amber-50 text-amber-700',
  CONVERTED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  LOST: 'border-slate-200 bg-slate-50 text-slate-500',
  EXPIRED: 'border-red-200 bg-red-50 text-red-600',
}

function daysLeft(until: string): number {
  return Math.max(0, Math.ceil((new Date(until).getTime() - Date.now()) / 86_400_000))
}

export default function PartnerLeadsPage() {
  const [leads, setLeads] = useState<LeadRow[]>([])
  const [protectionDays, setProtectionDays] = useState(90)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/partners/leads')
      const data = await res.json()
      if (res.ok) {
        setLeads(data.leads)
        setProtectionDays(data.protectionDays)
      } else {
        toast.error(data.message || 'Failed to load leads')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function register(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formEl = e.currentTarget
    const form = new FormData(formEl)
    setSaving(true)
    try {
      const res = await fetch('/api/partners/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicName: form.get('clinicName'),
          contactName: form.get('contactName') || '',
          email: form.get('email') || '',
          phone: form.get('phone') || '',
          npiNumber: form.get('npiNumber') || '',
          notes: form.get('notes') || '',
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.message || 'Failed to register lead')
        return
      }
      toast.success(`Lead registered — protected for ${protectionDays} days`)
      formEl.reset()
      void load()
    } finally {
      setSaving(false)
    }
  }

  async function setStatus(leadId: string, status: 'NEW' | 'WORKING' | 'LOST') {
    const res = await fetch('/api/partners/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, status }),
    })
    if (res.ok) void load()
    else toast.error('Failed to update lead')
  }

  const active = leads.filter((l) => l.status === 'NEW' || l.status === 'WORKING')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description={
          <>
            Register prospects you&rsquo;re working <em>before</em> they sign up. For{' '}
            {protectionDays} days, if they onboard with a matching email or NPI, the attribution is
            yours — even without a link click.
          </>
        }
      />

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            <UserPlus className="h-4 w-4 text-slate-400" /> Register a prospect
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={register} className="grid gap-3 sm:grid-cols-3">
            <Input name="clinicName" required placeholder="Clinic / practice name *" className="bg-white" />
            <Input name="contactName" placeholder="Contact name" className="bg-white" />
            <Input name="email" type="email" placeholder="Contact email (match key)" className="bg-white" />
            <Input name="npiNumber" placeholder="NPI # (match key)" className="bg-white" />
            <Input name="phone" placeholder="Phone" className="bg-white" />
            <Input name="notes" placeholder="Notes" className="bg-white" />
            <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
              <Button type="submit" disabled={saving} className="font-semibold">
                {saving ? 'Registering…' : 'Register lead'}
              </Button>
              <span className="text-xs text-slate-400">
                Provide an email or NPI so we can match the signup to you.
              </span>
            </div>
          </form>
        </CardContent>
      </Card>

      {active.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
          <ShieldCheck className="h-4 w-4" /> {active.length} prospect
          {active.length === 1 ? '' : 's'} under active protection
        </p>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <TableHead className="text-xs uppercase tracking-wide">Prospect</TableHead>
                <TableHead className="text-xs uppercase tracking-wide">Match keys</TableHead>
                <TableHead className="text-xs uppercase tracking-wide">Owner</TableHead>
                <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
                <TableHead className="text-xs uppercase tracking-wide">Protection</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading &&
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j} className="py-3">
                        <Skeleton className="h-4 w-full max-w-32" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              {!loading && leads.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6}>
                    <EmptyState
                      icon={UserPlus}
                      title="No leads yet"
                      description="Register the clinics you're courting above to lock in attribution."
                      className="py-8"
                    />
                  </TableCell>
                </TableRow>
              )}
              {!loading &&
                leads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="py-3">
                      <div className="font-medium text-slate-900">{lead.clinicName}</div>
                      <div className="text-xs text-slate-400">
                        {lead.contactName || '—'}
                        {lead.matchedClient && (
                          <span className="ml-2 text-emerald-600">
                            → became {lead.matchedClient.organizationName}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-xs text-slate-500">
                      {lead.email && <div>{lead.email}</div>}
                      {lead.npiNumber && <div>NPI {lead.npiNumber}</div>}
                    </TableCell>
                    <TableCell className="py-3">{lead.rep?.name || 'Organization'}</TableCell>
                    <TableCell className="py-3">
                      <Badge variant="outline" className={`font-medium ${STATUS_BADGE[lead.status]}`}>
                        {lead.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3 text-xs">
                      {lead.status === 'NEW' || lead.status === 'WORKING' ? (
                        <span
                          className={
                            daysLeft(lead.protectedUntil) <= 14 ? 'font-medium text-amber-600' : 'text-slate-500'
                          }
                        >
                          {daysLeft(lead.protectedUntil)} days left
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3 text-right text-xs">
                      {(lead.status === 'NEW' || lead.status === 'WORKING' || lead.status === 'LOST') && (
                        <select
                          value={lead.status}
                          onChange={(e) => void setStatus(lead.id, e.target.value as 'NEW' | 'WORKING' | 'LOST')}
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                        >
                          <option value="NEW">New</option>
                          <option value="WORKING">Working</option>
                          <option value="LOST">Lost</option>
                        </select>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  )
}
