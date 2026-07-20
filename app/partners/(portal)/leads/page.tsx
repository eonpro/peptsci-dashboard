'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ShieldCheck, UserPlus } from 'lucide-react'

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
  NEW: 'bg-blue-500/15 text-blue-300',
  WORKING: 'bg-amber-500/15 text-amber-300',
  CONVERTED: 'bg-emerald-500/15 text-emerald-300',
  LOST: 'bg-slate-500/15 text-slate-400',
  EXPIRED: 'bg-red-500/15 text-red-300',
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
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Leads</h1>
        <p className="text-sm text-slate-500">
          Register prospects you&rsquo;re working <em>before</em> they sign up. For{' '}
          {protectionDays} days, if they onboard with a matching email or NPI, the attribution is
          yours — even without a link click.
        </p>
      </div>

      <form onSubmit={register} className="grid gap-2 rounded-xl border bg-white p-4 sm:grid-cols-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 sm:col-span-3">
          <UserPlus className="h-4 w-4 text-slate-400" /> Register a prospect
        </div>
        <input name="clinicName" required placeholder="Clinic / practice name *" className="rounded-md border px-3 py-2 text-sm" />
        <input name="contactName" placeholder="Contact name" className="rounded-md border px-3 py-2 text-sm" />
        <input name="email" type="email" placeholder="Contact email (match key)" className="rounded-md border px-3 py-2 text-sm" />
        <input name="npiNumber" placeholder="NPI # (match key)" className="rounded-md border px-3 py-2 text-sm" />
        <input name="phone" placeholder="Phone" className="rounded-md border px-3 py-2 text-sm" />
        <input name="notes" placeholder="Notes" className="rounded-md border px-3 py-2 text-sm" />
        <div className="sm:col-span-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[#213cef] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1a30c4] disabled:opacity-60"
          >
            {saving ? 'Registering…' : 'Register lead'}
          </button>
          <span className="ml-3 text-xs text-slate-400">
            Provide an email or NPI so we can match the signup to you.
          </span>
        </div>
      </form>

      {active.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-700">
          <ShieldCheck className="h-4 w-4" /> {active.length} prospect
          {active.length === 1 ? '' : 's'} under active protection
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Prospect</th>
              <th className="px-4 py-3">Match keys</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Protection</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">Loading…</td>
              </tr>
            )}
            {!loading && leads.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  No leads yet — register the clinics you&rsquo;re courting above.
                </td>
              </tr>
            )}
            {leads.map((lead) => (
              <tr key={lead.id} className="border-b last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium">{lead.clinicName}</div>
                  <div className="text-xs text-slate-400">
                    {lead.contactName || '—'}
                    {lead.matchedClient && (
                      <span className="ml-2 text-emerald-600">
                        → became {lead.matchedClient.organizationName}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {lead.email && <div>{lead.email}</div>}
                  {lead.npiNumber && <div>NPI {lead.npiNumber}</div>}
                </td>
                <td className="px-4 py-3">{lead.rep?.name || 'Organization'}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[lead.status]}`}>
                    {lead.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs">
                  {lead.status === 'NEW' || lead.status === 'WORKING' ? (
                    <span className={daysLeft(lead.protectedUntil) <= 14 ? 'text-amber-600' : 'text-slate-500'}>
                      {daysLeft(lead.protectedUntil)} days left
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-xs">
                  {(lead.status === 'NEW' || lead.status === 'WORKING' || lead.status === 'LOST') && (
                    <select
                      value={lead.status}
                      onChange={(e) => void setStatus(lead.id, e.target.value as 'NEW' | 'WORKING' | 'LOST')}
                      className="rounded-md border px-2 py-1 text-xs"
                    >
                      <option value="NEW">New</option>
                      <option value="WORKING">Working</option>
                      <option value="LOST">Lost</option>
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
