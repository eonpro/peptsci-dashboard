'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useRole } from '@/hooks/useRole'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { AddressFields } from '@/components/AddressFields'
import type { Address } from '@/lib/address'
import type { ClientProfile } from '@/lib/profile'
import InviteUserDialog from '../../users/InviteUserDialog'
import DeleteClientButton from '../DeleteClientButton'
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
  UserPlus,
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
const inputClass = 'h-12 bg-white/5 border-white/10 text-white rounded-xl'
const labelClass = 'text-white/70'

const statusStyles: Record<string, string> = {
  APPROVED: 'border-green-500/30 text-green-400 bg-green-500/10',
  ACTIVE: 'border-green-500/30 text-green-400 bg-green-500/10',
  PENDING: 'border-amber-500/30 text-amber-400 bg-amber-500/10',
  NEEDS_INFO: 'border-amber-500/30 text-amber-400 bg-amber-500/10',
  REJECTED: 'border-red-500/30 text-red-400 bg-red-500/10',
  SUSPENDED: 'border-red-500/30 text-red-400 bg-red-500/10',
}

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { isSuperAdmin } = useRole()
  const id = params.id

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)

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

  const refetchUsers = useCallback(async () => {
    const res = await fetch(`/api/admin/clients/${id}`)
    if (res.ok) {
      const data = await res.json()
      setUsers(data.users ?? [])
    }
  }, [id])

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
    if (ok) await refetchUsers()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-white/60">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="container mx-auto p-6">
        <p className="text-white/60">Client not found.</p>
        <Link href="/clients" className="text-sm text-brand-primary underline">
          Back to clients
        </Link>
      </div>
    )
  }

  return (
    <div className="container mx-auto space-y-6 p-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          asChild
          className="text-white/70 hover:text-white hover:bg-white/10"
        >
          <Link href="/clients">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {profile.organizationName}
          </h1>
          <p className="text-sm text-white/50">
            {profile.providerName ?? '—'} · NPI {profile.npiNumber ?? '—'}
          </p>
        </div>
        <Badge variant="outline" className={statusStyles[profile.onboardingStatus] ?? 'text-white/70'}>
          {profile.onboardingStatus}
        </Badge>
        <DeleteClientButton
          clientId={id}
          organizationName={profile.organizationName}
          orderCount={counts?.orders ?? 0}
          redirectOnSuccess
        />
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm p-3">
          {error}
        </div>
      )}

      {/* Approval actions */}
      <Card className="bg-[#0a0e3a]/50 border-white/10">
        <CardHeader>
          <CardTitle className="text-base text-white">Approval</CardTitle>
          <CardDescription className="text-white/50">
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
            className="border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <Clock className="mr-2 h-4 w-4" /> Set Pending
          </Button>
          <Button
            variant="outline"
            onClick={() => setStatus('REJECTED')}
            disabled={saving || profile.onboardingStatus === 'REJECTED'}
            className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
          >
            <Ban className="mr-2 h-4 w-4" /> Reject
          </Button>
        </CardContent>
      </Card>

      {/* Provider & practice */}
      <Card className="bg-[#0a0e3a]/50 border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-white">
            <Stethoscope className="h-5 w-5" /> Provider & Practice
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className={labelClass}>NPI Number</Label>
              <Input
                className={inputClass}
                value={npiNumber}
                onChange={(e) => setNpiNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className={labelClass}>Provider Name</Label>
              <Input
                className={inputClass}
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className={labelClass}>Practice / Organization</Label>
            <Input
              className={inputClass}
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Contact */}
      <Card className="bg-[#0a0e3a]/50 border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-white">
            <User className="h-5 w-5" /> Contact
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className={labelClass}>Contact Name</Label>
            <Input
              className={inputClass}
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className={labelClass}>Email</Label>
              <Input
                type="email"
                className={inputClass}
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className={labelClass}>Phone</Label>
              <Input
                type="tel"
                className={inputClass}
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Addresses */}
      <Card className="bg-[#0a0e3a]/50 border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-white">
            <Building2 className="h-5 w-5" /> Billing Address
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AddressFields value={billing} onChange={setBilling} idPrefix="admin-billing" dark />
        </CardContent>
      </Card>
      <Card className="bg-[#0a0e3a]/50 border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-white">
            <MapPin className="h-5 w-5" /> Shipping Address
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AddressFields value={shipping} onChange={setShipping} idPrefix="admin-shipping" dark />
        </CardContent>
      </Card>

      <Button
        onClick={handleSave}
        disabled={saving}
        className="bg-brand-primary hover:bg-[#1a30c0] text-white"
      >
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

      <Separator className="bg-white/10" />

      {/* Linked users */}
      <Card className="bg-[#0a0e3a]/50 border-white/10">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base text-white">
              <UsersIcon className="h-5 w-5" /> Linked Users{' '}
              {counts ? (
                <span className="text-white/40 font-normal">· {counts.orders} orders</span>
              ) : null}
            </CardTitle>
            <Button
              size="sm"
              onClick={() => setInviteOpen(true)}
              className="bg-brand-primary hover:bg-[#1a30c0] text-white"
            >
              <UserPlus className="h-4 w-4 mr-1.5" /> Invite user
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {users.length === 0 ? (
            <p className="text-sm text-white/50">No users linked to this practice.</p>
          ) : (
            users.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between rounded-lg border border-white/10 p-3 text-sm"
              >
                <div>
                  <p className="font-medium text-white">
                    {[u.firstName, u.lastName].filter(Boolean).join(' ') || u.email}
                  </p>
                  <p className="text-white/50">{u.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-white/70 border-white/20">
                    {u.role}
                  </Badge>
                  <Badge variant="outline" className={statusStyles[u.status] ?? 'text-white/70'}>
                    {u.status}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <InviteUserDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        clients={[{ id, organizationName: profile.organizationName }]}
        isSuperAdmin={isSuperAdmin}
        defaultClientId={id}
        lockClient
        onInvited={refetchUsers}
      />
    </div>
  )
}
