'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AddressFields } from '@/components/AddressFields'
import { NpiLookup } from '@/components/NpiLookup'
import type { Address } from '@/lib/address'
import type { NormalizedProvider } from '@/lib/npi'
import { Loader2, Building2 } from 'lucide-react'

const inputClass = 'h-12 bg-white/5 border-white/10 text-white rounded-xl placeholder:text-white/30'
const labelClass = 'text-white/70'
const emptyAddress: Partial<Address> = { country: 'US' }

type OnboardingStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_INFO'

function hasStreet(a: Partial<Address>): boolean {
  return Boolean(a.address1 && a.address1.trim())
}

/**
 * Create a new practice/client. NPI lookup pre-fills provider + address; NPI is
 * optional for admin-created accounts. Defaults the account to APPROVED.
 */
export default function AddClientDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [organizationName, setOrganizationName] = useState('')
  const [providerName, setProviderName] = useState('')
  const [npiNumber, setNpiNumber] = useState('')
  const [ein, setEin] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [billing, setBilling] = useState<Partial<Address>>(emptyAddress)
  const [shipping, setShipping] = useState<Partial<Address>>(emptyAddress)
  const [shipSame, setShipSame] = useState(true)
  const [status, setStatus] = useState<OnboardingStatus>('APPROVED')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setOrganizationName('')
      setProviderName('')
      setNpiNumber('')
      setEin('')
      setContactName('')
      setContactEmail('')
      setContactPhone('')
      setBilling(emptyAddress)
      setShipping(emptyAddress)
      setShipSame(true)
      setStatus('APPROVED')
      setError(null)
    }
  }, [open])

  function applyProvider(p: NormalizedProvider) {
    setNpiNumber(p.npiNumber)
    setProviderName(p.providerName)
    if (p.organizationName && !organizationName) setOrganizationName(p.organizationName)
    if (!organizationName && !p.organizationName) setOrganizationName(p.providerName)
    if (p.phone && !contactPhone) setContactPhone(p.phone)
    if (p.practiceAddress) setBilling({ ...p.practiceAddress })
  }

  async function submit() {
    setError(null)
    if (organizationName.trim().length < 2) {
      setError('Practice / organization name is required')
      return
    }
    const billingOut = hasStreet(billing) ? billing : undefined
    const shippingOut = shipSame ? billingOut : hasStreet(shipping) ? shipping : undefined

    setSaving(true)
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationName: organizationName.trim(),
          ...(providerName.trim() ? { providerName: providerName.trim() } : {}),
          ...(npiNumber.trim() ? { npiNumber: npiNumber.trim() } : {}),
          ...(ein.trim() ? { ein: ein.trim() } : {}),
          ...(contactName.trim() ? { contactName: contactName.trim() } : {}),
          ...(contactEmail.trim() ? { contactEmail: contactEmail.trim() } : {}),
          ...(contactPhone.trim() ? { contactPhone: contactPhone.trim() } : {}),
          ...(billingOut ? { billingAddress: billingOut } : {}),
          ...(shippingOut ? { shippingAddress: shippingOut } : {}),
          onboardingStatus: status,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Failed to create client')
      onOpenChange(false)
      // Navigate to the new client's detail page.
      if (data?.client?.id) router.push(`/clients/${data.client.id}`)
      else router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create client')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-brand-onyx border-white/10 text-white sm:max-w-[620px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Building2 className="h-5 w-5 text-brand-primary" /> Add Client
          </DialogTitle>
          <DialogDescription className="text-white/60">
            Create a practice / organization. Search NPI to auto-fill provider details.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label className={labelClass}>NPI Lookup (optional)</Label>
            <NpiLookup onSelect={applyProvider} dark />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className={labelClass}>Practice / Organization *</Label>
              <Input
                className={inputClass}
                placeholder="Downtown Wellness Clinic"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className={labelClass}>Provider Name</Label>
              <Input
                className={inputClass}
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className={labelClass}>NPI Number</Label>
              <Input
                className={inputClass}
                placeholder="10-digit NPI"
                value={npiNumber}
                onChange={(e) => setNpiNumber(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className={labelClass}>EIN (Tax ID)</Label>
              <Input
                className={inputClass}
                placeholder="XX-XXXXXXX"
                value={ein}
                onChange={(e) => setEin(e.target.value)}
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className={labelClass}>Onboarding Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as OnboardingStatus)}>
              <SelectTrigger className="h-12 bg-white/5 border-white/10 text-white rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-brand-onyx border-white/10">
                <SelectItem value="APPROVED" className="text-white focus:bg-white/10 focus:text-white">
                  Approved
                </SelectItem>
                <SelectItem value="PENDING" className="text-white focus:bg-white/10 focus:text-white">
                  Pending
                </SelectItem>
                <SelectItem value="NEEDS_INFO" className="text-white focus:bg-white/10 focus:text-white">
                  Needs Info
                </SelectItem>
                <SelectItem value="REJECTED" className="text-white focus:bg-white/10 focus:text-white">
                  Rejected
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className={labelClass}>Contact Name</Label>
            <Input
              className={inputClass}
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className={labelClass}>Contact Email</Label>
              <Input
                type="email"
                className={inputClass}
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className={labelClass}>Contact Phone</Label>
              <Input
                type="tel"
                className={inputClass}
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-white/10 p-4">
            <p className="text-sm font-medium text-white/80">Billing Address</p>
            <AddressFields value={billing} onChange={setBilling} idPrefix="new-client-billing" dark />
          </div>

          <label className="flex items-center gap-2 text-sm text-white/70">
            <Checkbox
              checked={shipSame}
              onCheckedChange={(v) => setShipSame(v === true)}
            />
            Shipping address same as billing
          </label>

          {!shipSame && (
            <div className="space-y-2 rounded-xl border border-white/10 p-4">
              <p className="text-sm font-medium text-white/80">Shipping Address</p>
              <AddressFields
                value={shipping}
                onChange={setShipping}
                idPrefix="new-client-shipping"
                dark
              />
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={saving}
            className="bg-brand-primary hover:bg-[#1a30c0] text-white"
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Client
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
