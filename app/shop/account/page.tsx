'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { AddressFields } from '@/components/AddressFields'
import { SavedCards } from '@/components/shop/SavedCards'
import { PatientsManager } from '@/components/shop/PatientsManager'
import { DocumentsManager } from '@/components/shop/DocumentsManager'
import type { Address } from '@/lib/address'
import type { ClientProfile } from '@/lib/profile'
import {
  User,
  Building2,
  Stethoscope,
  MapPin,
  Shield,
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock,
  CreditCard,
  UserRound,
  Lock,
  Loader2,
} from 'lucide-react'

const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  APPROVED: { label: 'Approved', color: 'bg-green-500/20 text-green-400', icon: CheckCircle2 },
  PENDING: { label: 'Pending Approval', color: 'bg-yellow-500/20 text-yellow-400', icon: Clock },
  NEEDS_INFO: { label: 'Needs Info', color: 'bg-yellow-500/20 text-yellow-400', icon: AlertCircle },
  REJECTED: { label: 'Not Approved', color: 'bg-red-500/20 text-red-400', icon: AlertCircle },
}

const emptyAddress: Partial<Address> = { country: 'US' }

export default function AccountPage() {
  const [profile, setProfile] = useState<ClientProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Editable fields
  const [organizationName, setOrganizationName] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [billing, setBilling] = useState<Partial<Address>>(emptyAddress)
  const [shipping, setShipping] = useState<Partial<Address>>(emptyAddress)

  useEffect(() => {
    fetch('/api/shop/profile')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.profile) return
        const p: ClientProfile = data.profile
        setProfile(p)
        setOrganizationName(p.organizationName ?? '')
        setContactName(p.contactName ?? '')
        setContactEmail(p.contactEmail ?? '')
        setContactPhone(p.contactPhone ?? '')
        setBilling(p.billingAddress ?? emptyAddress)
        setShipping(p.shippingAddress ?? emptyAddress)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Mirror lib/profile.ts (profileUpdateSchema + addressSchema) so failures
  // are caught before the request and name the offending field.
  const validateProfile = (): string | null => {
    if (!profile?.npiLocked && organizationName.trim().length < 2) {
      return 'Practice / Organization name must be at least 2 characters.'
    }
    if (contactName.trim().length < 2) {
      return 'Contact Name must be at least 2 characters.'
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) {
      return 'Enter a valid Email address.'
    }
    const phone = contactPhone.trim()
    if (phone.length < 7 || phone.length > 30) {
      return 'Phone must be between 7 and 30 characters.'
    }
    const checkAddress = (addr: Partial<Address>, label: string): string | null => {
      if (!addr.address1?.trim()) return `${label}: street address is required.`
      if (!addr.city?.trim()) return `${label}: city is required.`
      if ((addr.state?.trim().length ?? 0) < 2) return `${label}: state is required.`
      if (!/^\d{5}(-\d{4})?$/.test(addr.zip?.trim() ?? '')) {
        return `${label}: enter a valid ZIP code (e.g. 12345 or 12345-6789).`
      }
      return null
    }
    return (
      checkAddress(billing, 'Billing Address') ??
      checkAddress(shipping, 'Practice Shipping Address')
    )
  }

  const handleSave = async () => {
    const validationError = validateProfile()
    if (validationError) {
      setError(validationError)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        contactName,
        contactEmail,
        contactPhone,
        billingAddress: billing,
        shippingAddress: shipping,
      }
      if (!profile?.npiLocked) body.organizationName = organizationName
      const res = await fetch('/api/shop/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Could not save changes')
      setProfile(data.profile)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save changes')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-white/40">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  const status = statusConfig[profile?.onboardingStatus ?? 'PENDING'] ?? statusConfig.PENDING
  const StatusIcon = status.icon
  const locked = profile?.npiLocked

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 md:pb-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-white">My Account</h1>
        <p className="text-white/60 mt-1 text-sm md:text-base">
          Manage your practice profile, payment methods, and patients
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm p-3">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Provider / NPI (locked once approved) */}
          <Card className="bg-[#0a0e3a] border-white/10 rounded-2xl overflow-hidden">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-3 text-white">
                <div className="h-10 w-10 rounded-xl bg-brand-primary/20 flex items-center justify-center">
                  <Stethoscope className="h-5 w-5 text-brand-primary" />
                </div>
                Provider & Practice
              </CardTitle>
              <CardDescription className="text-white/60">
                Your verified NPI and practice name
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-white/80 text-sm flex items-center gap-1">
                    NPI Number {locked && <Lock className="h-3 w-3 text-white/40" />}
                  </Label>
                  <Input
                    value={profile?.npiNumber ?? ''}
                    disabled
                    className="h-12 bg-white/5 border-white/10 text-white/60 rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/80 text-sm">Provider Name</Label>
                  <Input
                    value={profile?.providerName ?? ''}
                    disabled
                    className="h-12 bg-white/5 border-white/10 text-white/60 rounded-xl"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="org" className="text-white/80 text-sm flex items-center gap-1">
                  Practice / Organization {locked && <Lock className="h-3 w-3 text-white/40" />}
                </Label>
                <Input
                  id="org"
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  disabled={locked}
                  className="h-12 bg-white/5 border-white/10 text-white rounded-xl disabled:text-white/60"
                />
              </div>
              {locked && (
                <div className="flex items-center gap-2 p-3 bg-brand-primary/20 rounded-lg text-sm text-brand-primary">
                  <FileText className="h-4 w-4" />
                  <span>NPI and practice name are locked after approval. Contact support to change them.</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Contact */}
          <Card className="bg-[#0a0e3a] border-white/10 rounded-2xl overflow-hidden">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-3 text-white">
                <div className="h-10 w-10 rounded-xl bg-brand-primary/20 flex items-center justify-center">
                  <User className="h-5 w-5 text-brand-primary" />
                </div>
                Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="contactName" className="text-white/80 text-sm">
                  Contact Name
                </Label>
                <Input
                  id="contactName"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="h-12 bg-white/5 border-white/10 text-white rounded-xl"
                />
              </div>
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-white/80 text-sm">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className="h-12 bg-white/5 border-white/10 text-white rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-white/80 text-sm">
                    Phone
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    className="h-12 bg-white/5 border-white/10 text-white rounded-xl"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Billing address */}
          <Card className="bg-[#0a0e3a] border-white/10 rounded-2xl overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Building2 className="h-5 w-5" />
                Billing Address
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AddressFields value={billing} onChange={setBilling} idPrefix="acct-billing" dark />
            </CardContent>
          </Card>

          {/* Shipping address */}
          <Card className="bg-[#0a0e3a] border-white/10 rounded-2xl overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <MapPin className="h-5 w-5" />
                Practice Shipping Address
              </CardTitle>
              <CardDescription className="text-white/60">
                Default address when shipping to your practice
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AddressFields value={shipping} onChange={setShipping} idPrefix="acct-shipping" dark />
            </CardContent>
          </Card>

          <Button
            className="w-full sm:w-auto h-12 px-6 bg-brand-primary hover:bg-[#1a30c0] text-white rounded-xl"
            onClick={handleSave}
            disabled={saving}
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

          {/* Payment methods */}
          <Card className="bg-[#0a0e3a] border-white/10 rounded-2xl overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <CreditCard className="h-5 w-5" />
                Payment Methods
              </CardTitle>
              <CardDescription className="text-white/60">
                Saved cards for faster checkout and reorders
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SavedCards />
            </CardContent>
          </Card>

          {/* Patients */}
          <Card className="bg-[#0a0e3a] border-white/10 rounded-2xl overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <UserRound className="h-5 w-5" />
                Patients
              </CardTitle>
              <CardDescription className="text-white/60">
                Saved recipients for &quot;ship to patient&quot; orders
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PatientsManager />
            </CardContent>
          </Card>

          {/* Compliance documents */}
          <Card className="bg-[#0a0e3a] border-white/10 rounded-2xl overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <FileText className="h-5 w-5" />
                Compliance Documents
              </CardTitle>
              <CardDescription className="text-white/60">
                Licenses, DEA registration, insurance, and resale certificates on file
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DocumentsManager />
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card className="bg-[#0a0e3a] border-white/10 rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Shield className="h-5 w-5" />
                Account Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${status.color.split(' ')[0]}`}>
                  <StatusIcon className={`h-5 w-5 ${status.color.split(' ')[1]}`} />
                </div>
                <Badge className={status.color}>{status.label}</Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#0a0e3a] border-white/10 rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base text-white">Quick Links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="ghost"
                className="w-full justify-start text-white/70 hover:text-white hover:bg-white/10"
                asChild
              >
                <Link href="/shop/orders">
                  <FileText className="mr-2 h-4 w-4" />
                  Order History
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
