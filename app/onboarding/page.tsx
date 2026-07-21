'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser, useClerk } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Logo } from '@/components/Logo'
import { AddressFields } from '@/components/AddressFields'
import { NpiLookup } from '@/components/NpiLookup'
import type { Address } from '@/lib/address'
import { isValidNpi, cleanNpi, isNpiBypass, NPI_BYPASS, type NormalizedProvider } from '@/lib/npi'
import { SMS_OPT_IN_STORAGE_KEY } from '@/components/auth/SmsOptInConsent'
import { Building2, Stethoscope, MapPin, User, Loader2, CheckCircle2, LogOut } from 'lucide-react'

const emptyAddress: Partial<Address> = { country: 'US' }

export default function OnboardingPage() {
  const router = useRouter()
  const { user } = useUser()
  const { signOut } = useClerk()

  const [checking, setChecking] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [npiNumber, setNpiNumber] = useState('')
  const [providerName, setProviderName] = useState('')
  const [npiData, setNpiData] = useState<NormalizedProvider | null>(null)
  const [organizationName, setOrganizationName] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  // TCPA/A2P: SMS consent is collected once on the sign-up page. The choice is
  // read from localStorage here and persisted server-side on submit.
  const [smsOptIn, setSmsOptIn] = useState(false)
  useEffect(() => {
    try {
      if (window.localStorage.getItem(SMS_OPT_IN_STORAGE_KEY) === 'true') setSmsOptIn(true)
    } catch {
      /* storage unavailable */
    }
  }, [])
  const [billing, setBilling] = useState<Partial<Address>>(emptyAddress)
  const [sameAsBilling, setSameAsBilling] = useState(true)
  const [shipping, setShipping] = useState<Partial<Address>>(emptyAddress)

  // Prefill contact name/email from the Clerk profile.
  useEffect(() => {
    if (!user) return
    setContactName((prev) => prev || [user.firstName, user.lastName].filter(Boolean).join(' '))
    setContactEmail((prev) => prev || user.primaryEmailAddress?.emailAddress || '')
  }, [user])

  // If already onboarded, skip the form.
  useEffect(() => {
    let active = true
    fetch('/api/onboarding')
      .then((r) => (r.ok ? r.json() : { hasClient: false }))
      .then((data) => {
        if (!active) return
        if (data.hasClient) router.replace('/pending-approval')
        else setChecking(false)
      })
      .catch(() => active && setChecking(false))
    return () => {
      active = false
    }
  }, [router])

  const applyProvider = (p: NormalizedProvider) => {
    if (p.npiNumber === NPI_BYPASS) {
      // Non-provider bypass: no NPPES data to apply, provider name optional.
      setNpiNumber(NPI_BYPASS)
      setProviderName('')
      setNpiData(null)
      return
    }
    setNpiNumber(p.npiNumber)
    setProviderName(p.providerName)
    setNpiData(p)
    if (p.organizationName) setOrganizationName((prev) => prev || p.organizationName!)
    if (p.practiceAddress) {
      setBilling({ ...p.practiceAddress })
    }
    if (p.phone) setContactPhone((prev) => prev || p.phone!)
  }

  const npiBypassed = isNpiBypass(npiNumber)

  // Mirror the server onboardingSchema requirements so the submit button only
  // enables once the NPI, contact details, and address(es) are filled in.
  const addressComplete = (addr: Partial<Address>) =>
    Boolean(
      addr.address1?.trim() &&
        addr.city?.trim() &&
        (addr.state?.trim().length ?? 0) >= 2 &&
        /^\d{5}(-\d{4})?$/.test(addr.zip?.trim() ?? '')
    )
  const canSubmit =
    (isValidNpi(cleanNpi(npiNumber)) || npiBypassed) &&
    (npiBypassed || providerName.trim().length >= 2) &&
    organizationName.trim().length >= 2 &&
    contactName.trim().length >= 2 &&
    contactEmail.trim().length > 0 &&
    contactPhone.trim().length >= 7 &&
    addressComplete(billing) &&
    (sameAsBilling || addressComplete(shipping))

  const handleSubmit = async () => {
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          npiNumber,
          providerName,
          organizationName,
          contactName,
          contactEmail,
          contactPhone,
          smsOptIn,
          billingAddress: billing,
          shippingSameAsBilling: sameAsBilling,
          shippingAddress: sameAsBilling ? undefined : shipping,
          npiData,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Could not save your practice details')
      // Consent is persisted server-side now; clear the sign-up page stash.
      try {
        window.localStorage.removeItem(SMS_OPT_IN_STORAGE_KEY)
      } catch {
        /* ignore */
      }
      // Refresh the Clerk session so middleware sees the new clientId.
      await user?.reload().catch(() => {})
      // Confirmation page with the unique application number (falls back to
      // the pending screen for idempotent resubmits, which have no reference).
      if (data.reference) {
        router.push(`/thank-you?form=clinic&ref=${encodeURIComponent(data.reference)}`)
      } else {
        router.push('/pending-approval')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-linear-to-br from-brand-bg via-white to-brand-bg/50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-brand-bg via-white to-brand-bg/50 py-10 px-4">
      <div className="mx-auto max-w-2xl">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 inline-block">
            <Logo width={150} height={50} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Complete your practice profile</h1>
          <p className="text-gray-600 mt-2 max-w-lg mx-auto">
            Welcome{user?.firstName ? `, ${user.firstName}` : ''}! Tell us about your practice so we
            can verify your provider credentials and set up your account for approval.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm p-4">
            {error}
          </div>
        )}

        <div className="space-y-6">
          {/* Provider & NPI */}
          <Card className="shadow-lg border-0 bg-white/95">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-gray-900">
                <Stethoscope className="h-5 w-5 text-brand-primary" />
                Provider Verification (NPI)
              </CardTitle>
              <CardDescription>
                Look up your National Provider Identifier by number or name. We verify it against the
                federal NPPES registry. Not a provider? Enter 000000000 to continue without one.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Search the NPI registry *</Label>
                <NpiLookup onSelect={applyProvider} allowBypass />
              </div>
              {npiNumber && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="npiNumber">NPI Number</Label>
                    <Input
                      id="npiNumber"
                      value={npiNumber}
                      onChange={(e) => setNpiNumber(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="providerName">
                      Provider Name{npiBypassed ? ' (optional)' : ''}
                    </Label>
                    <Input
                      id="providerName"
                      value={providerName}
                      onChange={(e) => setProviderName(e.target.value)}
                    />
                  </div>
                  {npiBypassed ? (
                    <div className="sm:col-span-2 flex items-center gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg p-2.5">
                      <CheckCircle2 className="h-4 w-4" />
                      Continuing as a non-provider — NPI verification skipped
                    </div>
                  ) : npiData ? (
                    <div className="sm:col-span-2 flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg p-2.5">
                      <CheckCircle2 className="h-4 w-4" />
                      Verified against NPPES{npiData.primaryTaxonomy ? ` • ${npiData.primaryTaxonomy}` : ''}
                    </div>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Practice & contact */}
          <Card className="shadow-lg border-0 bg-white/95">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-gray-900">
                <Building2 className="h-5 w-5 text-brand-primary" />
                Practice & Contact
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="org">Practice / Organization Name *</Label>
                <Input
                  id="org"
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  placeholder="ABC Medical Clinic"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactName" className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5" /> Contact Name *
                </Label>
                <Input
                  id="contactName"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="contactEmail">Email *</Label>
                  <Input
                    id="contactEmail"
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactPhone">Phone *</Label>
                  <Input
                    id="contactPhone"
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Billing address */}
          <Card className="shadow-lg border-0 bg-white/95">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-gray-900">
                <MapPin className="h-5 w-5 text-brand-primary" />
                Billing Address
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AddressFields value={billing} onChange={setBilling} idPrefix="billing" />
            </CardContent>
          </Card>

          {/* Shipping address */}
          <Card className="shadow-lg border-0 bg-white/95">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-gray-900">
                <MapPin className="h-5 w-5 text-brand-primary" />
                Shipping Address
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sameAsBilling}
                  onChange={(e) => setSameAsBilling(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Same as billing address
              </label>
              {!sameAsBilling && (
                <AddressFields value={shipping} onChange={setShipping} idPrefix="shipping" />
              )}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-3">
            <Button
              className="w-full h-12 bg-brand-primary hover:bg-brand-primary/90 text-white text-base font-semibold"
              onClick={handleSubmit}
              disabled={submitting || !canSubmit}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…
                </>
              ) : (
                'Submit for Approval'
              )}
            </Button>
            <Button
              variant="ghost"
              className="w-full text-gray-500 hover:text-gray-700"
              onClick={() => signOut({ redirectUrl: '/sign-in' })}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
