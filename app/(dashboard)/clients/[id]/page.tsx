'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { AddressFields } from '@/components/AddressFields'
import type { Address } from '@/lib/address'
import type { ClientProfile } from '@/lib/profile'
import {
  ArrowLeft,
  Building2,
  Stethoscope,
  User,
  MapPin,
  Loader2,
  CheckCircle2,
  Ban,
  Clock,
  Users as UsersIcon,
} from 'lucide-react'

interface LinkedUser {
  id: string
  email: string | null
  firstName: string | null
  lastName: string | null
  role: string
  status: string
}

const emptyAddress: Partial<Address> = { country: 'US' }

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params.id

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  const [profile, setProfile] = useState<ClientProfile | null>(null)
  const [users, setUsers] = useState<LinkedUser[]>([])
  const [counts, setCounts] = useState<{ orders: number; patients: number } | null>(null)

  const [organizationName, setOrganizationName] = useState('')
  const [providerName, setProviderName] = useState('')
  const [npiNumber, setNpiNumber] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [billing, setBilling] = useState<Partial<Address>>(emptyAddress)
  const [shipping, setShipping] = useState<Partial<Address>>(emptyAddress)

  const hydrate = (p: ClientProfile) => {
    setProfile(p)
    setOrganizationName(p.organizationName ?? '')
    setProviderName(p.providerName ?? '')
    setNpiNumber(p.npiNumber ?? '')
    setContactName(p.contactName ?? '')
    setContactEmail(p.contactEmail ?? '')
    setContactPhone(p.contactPhone ?? '')
    setBilling(p.billingAddress ?? emptyAddress)
    setShipping(p.shippingAddress ?? emptyAddress)
  }

  useEffect(() => {
    fetch(`/api/admin/clients/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.profile) return
        hydrate(data.profile)
        setUsers(data.users ?? [])
        setCounts(data.counts ?? null)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  const patch = async (body: Record<string, unknown>, opts?: { flash?: boolean }) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/clients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Could not save')
      if (data.profile) hydrate(data.profile)
      if (opts?.flash) {
        setSavedFlash(true)
        setTimeout(() => setSavedFlash(false), 2500)
      }
      // Reload to refresh linked-user statuses after a status cascade.
      if (body.onboardingStatus) router.refresh()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
      return false
    } finally {
      setSaving(false)
    }
  }

  const handleSave = () =>
    patch(
      {
        organizationName,
        providerName,
        npiNumber,
        contactName,
        contactEmail,
        contactPhone,
        billingAddress: billing,
        shippingAddress: shipping,
      },
      { flash: true }
    )

  const setStatus = async (onboardingStatus: string) => {
    const ok = await patch({ onboardingStatus })
    if (ok) {
      // Re-fetch users to reflect cascaded status.
      const res = await fetch(`/api/admin/clients/${id}`)
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users ?? [])
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="container mx-auto p-6">
        <p className="text-muted-foreground">Client not found.</p>
        <Link href="/clients" className="text-sm underline">
          Back to clients
        </Link>
      </div>
    )
  }

  return (
    <div className="container mx-auto space-y-6 p-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/clients">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{profile.organizationName}</h1>
          <p className="text-sm text-muted-foreground">
            {profile.providerName ?? '—'} · NPI {profile.npiNumber ?? '—'}
          </p>
        </div>
        <Badge variant="outline">{profile.onboardingStatus}</Badge>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm p-3">
          {error}
        </div>
      )}

      {/* Approval actions */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">Approval</CardTitle>
          <CardDescription>
            Approving activates all linked users; rejecting suspends them.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            onClick={() => setStatus('APPROVED')}
            disabled={saving || profile.onboardingStatus === 'APPROVED'}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
          </Button>
          <Button
            variant="outline"
            onClick={() => setStatus('PENDING')}
            disabled={saving || profile.onboardingStatus === 'PENDING'}
          >
            <Clock className="mr-2 h-4 w-4" /> Set Pending
          </Button>
          <Button
            variant="outline"
            onClick={() => setStatus('REJECTED')}
            disabled={saving || profile.onboardingStatus === 'REJECTED'}
            className="text-red-600 hover:text-red-700"
          >
            <Ban className="mr-2 h-4 w-4" /> Reject
          </Button>
        </CardContent>
      </Card>

      {/* Provider & practice */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Stethoscope className="h-5 w-5" /> Provider & Practice
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>NPI Number</Label>
              <Input value={npiNumber} onChange={(e) => setNpiNumber(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Provider Name</Label>
              <Input value={providerName} onChange={(e) => setProviderName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Practice / Organization</Label>
            <Input value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Contact */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-5 w-5" /> Contact
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Contact Name</Label>
            <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Addresses */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-5 w-5" /> Billing Address
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AddressFields value={billing} onChange={setBilling} idPrefix="admin-billing" />
        </CardContent>
      </Card>
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-5 w-5" /> Shipping Address
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AddressFields value={shipping} onChange={setShipping} idPrefix="admin-shipping" />
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
          </>
        ) : savedFlash ? (
          <>
            <CheckCircle2 className="mr-2 h-4 w-4" /> Saved
          </>
        ) : (
          'Save Changes'
        )}
      </Button>

      <Separator />

      {/* Linked users */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UsersIcon className="h-5 w-5" /> Linked Users{' '}
            {counts ? <span className="text-muted-foreground font-normal">· {counts.orders} orders</span> : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground">No users linked to this practice.</p>
          ) : (
            users.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between rounded-lg border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {[u.firstName, u.lastName].filter(Boolean).join(' ') || u.email}
                  </p>
                  <p className="text-muted-foreground">{u.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{u.role}</Badge>
                  <Badge variant="outline">{u.status}</Badge>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
