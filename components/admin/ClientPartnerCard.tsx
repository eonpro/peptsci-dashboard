'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Handshake, Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface PartnerAttribution {
  org: { id: string; name: string }
  rep: { id: string; name: string } | null
}

interface OrgOption {
  id: string
  name: string
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED'
}

interface RepOption {
  id: string
  name: string
}

const selectClass =
  'h-12 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white [&>option]:text-black'

/**
 * Partner attribution on the admin client page: shows which partner org/rep
 * this clinic is credited to, and lets an admin attach it manually — for
 * clinics that signed up directly on the site but actually came from a
 * partner (no referral link used). Attribution affects FUTURE commission
 * transactions only.
 */
export function ClientPartnerCard({ clientId }: { clientId: string }) {
  const [partner, setPartner] = useState<PartnerAttribution | null>(null)
  const [orgs, setOrgs] = useState<OrgOption[]>([])
  const [reps, setReps] = useState<RepOption[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState('')
  const [selectedRepId, setSelectedRepId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [clientRes, orgsRes] = await Promise.all([
        fetch(`/api/admin/clients/${clientId}`),
        fetch('/api/admin/partners'),
      ])
      if (clientRes.ok) {
        const data = await clientRes.json()
        setPartner(data.partner ?? null)
      }
      if (orgsRes.ok) {
        const data = await orgsRes.json()
        setOrgs(data.orgs ?? [])
      }
    } catch {
      // non-critical card — stay quiet on load failures
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    void load()
  }, [load])

  // Rep options depend on the selected org (fetched from the org detail).
  useEffect(() => {
    setSelectedRepId('')
    if (!selectedOrgId) {
      setReps([])
      return
    }
    let cancelled = false
    fetch(`/api/admin/partners/${selectedOrgId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setReps(data?.org?.reps ?? [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [selectedOrgId])

  async function attach() {
    if (!selectedOrgId) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/partners/${selectedOrgId}/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, repId: selectedRepId || null }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(payload.message || 'Failed to attach partner')
        return
      }
      toast.success('Clinic attributed to partner')
      setSelectedOrgId('')
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function detach() {
    if (!partner) return
    if (!window.confirm(`Remove attribution to ${partner.org.name}? Historic commissions are untouched.`)) return
    setBusy(true)
    try {
      const res = await fetch(
        `/api/admin/partners/${partner.org.id}/clients?clientId=${clientId}`,
        { method: 'DELETE' }
      )
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(payload.message || 'Failed to detach partner')
        return
      }
      toast.success('Partner attribution removed')
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="bg-[#0a0e3a]/50 border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-white">
          <Handshake className="h-5 w-5" /> Partner Attribution
        </CardTitle>
        <CardDescription className="text-white/50">
          Credit this practice to a partner when it signed up directly without using the
          partner&apos;s referral link. Applies to future orders only.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-white/50">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : partner ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 p-3 text-sm">
            <div>
              <Link
                href={`/partners-admin/${partner.org.id}`}
                className="font-medium text-brand-primary underline underline-offset-2 hover:text-white"
              >
                {partner.org.name}
              </Link>
              <p className="text-white/50">
                Rep: {partner.rep?.name ?? '—'}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void detach()}
              className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
            >
              Detach
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              className={selectClass}
            >
              <option value="">Select partner org…</option>
              {orgs
                .filter((o) => o.status !== 'PENDING')
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                    {o.status === 'SUSPENDED' ? ' (suspended)' : ''}
                  </option>
                ))}
            </select>
            <select
              value={selectedRepId}
              onChange={(e) => setSelectedRepId(e.target.value)}
              disabled={!selectedOrgId}
              className={selectClass}
            >
              <option value="">No rep</option>
              {reps.map((rep) => (
                <option key={rep.id} value={rep.id}>
                  {rep.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={busy || !selectedOrgId}
              onClick={() => void attach()}
              className="bg-brand-primary hover:bg-[#1a30c0] text-white"
            >
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Attach
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
