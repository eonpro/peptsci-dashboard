'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCart } from '@/components/shop/CartContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { AddressFields } from '@/components/AddressFields'
import {
  ArrowLeft,
  CreditCard,
  Package,
  Truck,
  CheckCircle2,
  Building2,
  UserRound,
  Plus,
  Zap,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { CheckoutPaymentSection } from '@/components/shop/CheckoutPaymentSection'
import {
  computeShipping,
  FREE_SHIPPING_THRESHOLD,
  SHIPPING_RATES,
  type ShipSpeed,
  type ShipTo,
} from '@/lib/checkout-core'
import {
  BACKORDER_LEAD_TIME,
  BACKORDER_MIN_QUANTITY,
} from '@/lib/shop/backorder'
import { buildPracticeCheckoutAddress, type Address } from '@/lib/address'
import { CheckoutBacWaterOffer } from '@/components/shop/CheckoutBacWaterOffer'
import {
  checkoutCanPay,
  formatAddressOneLine,
  isPracticeAddressComplete,
  shouldExpandPracticeForm,
} from '@/lib/shop/checkout-ux'

interface Patient {
  id: string
  firstName: string
  lastName: string
  address: Address
  phone: string | null
  email: string | null
}

const emptyAddress: Partial<Address> = { country: 'US' }

export default function CheckoutPage() {
  const router = useRouter()
  const { items, subtotal, clearCart, totalItems } = useCart()
  const hasBackorder = items.some((item) => item.isBackorder)
  const [editingPractice, setEditingPractice] = useState(false)
  const [profileReady, setProfileReady] = useState(false)

  const [shipTo, setShipTo] = useState<ShipTo>('PRACTICE')
  const [shipSpeed, setShipSpeed] = useState<ShipSpeed>('TWO_DAY')

  // Practice ship-to (prefilled from the practice profile).
  const [practiceName, setPracticeName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [practiceAddr, setPracticeAddr] = useState<Partial<Address>>(emptyAddress)

  // Patient ship-to.
  const [patients, setPatients] = useState<Patient[]>([])
  const [selectedPatientId, setSelectedPatientId] = useState<string>('')
  const [showAddPatient, setShowAddPatient] = useState(false)
  const [savingPatient, setSavingPatient] = useState(false)
  const [addPatientError, setAddPatientError] = useState<string | null>(null)
  const [newPatient, setNewPatient] = useState<{
    firstName: string
    lastName: string
    phone: string
    address: Partial<Address>
  }>({ firstName: '', lastName: '', phone: '', address: emptyAddress })

  const [notes, setNotes] = useState('')
  const [prefillFailed, setPrefillFailed] = useState(false)
  // Field errors shown after the user tries to continue with invalid input.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [shippingOverrides, setShippingOverrides] = useState<{
    twoDay: number | null
    overnight: number | null
  }>({ twoDay: null, overnight: null })

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price)

  // Prefill the practice address from the profile.
  useEffect(() => {
    let active = true
    fetch('/api/shop/profile')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active) return
        if (!data?.profile) {
          setPrefillFailed(true)
          return
        }
        const p = data.profile
        setPracticeName(p.organizationName ?? '')
        setContactEmail(p.contactEmail ?? '')
        setContactPhone(p.contactPhone ?? '')
        const addr = p.shippingAddress ?? p.billingAddress
        if (addr) setPracticeAddr(addr)
        setShippingOverrides({
          twoDay: p.shippingRateTwoDay ?? null,
          overnight: p.shippingRateOvernight ?? null,
        })
      })
      .catch(() => {
        if (active) setPrefillFailed(true)
      })
      .finally(() => {
        if (active) setProfileReady(true)
      })
    return () => {
      active = false
    }
  }, [])

  // Load saved patients.
  const loadPatients = () => {
    fetch('/api/shop/patients')
      .then((r) => (r.ok ? r.json() : { patients: [] }))
      .then((data) => setPatients(data.patients ?? []))
      .catch(() => {})
  }
  useEffect(() => {
    loadPatients()
  }, [])

  const shipping = computeShipping(subtotal, shipSpeed, shippingOverrides)
  const total = subtotal + shipping // No tax (Model A)

  const selectedPatient = patients.find((p) => p.id === selectedPatientId)

  // Mirror the server addressSchema: address1/city/state required, ZIP must be
  // 5 digits (optionally +4). Email/phone validated for deliverability.
  const validatePracticeStep = (): Record<string, string> => {
    const errors: Record<string, string> = {}
    if (contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) {
      errors.email = 'Enter a valid email address'
    }
    if (contactPhone.trim() && contactPhone.replace(/\D/g, '').length < 10) {
      errors.phone = 'Enter a 10-digit phone number'
    }
    if (!practiceAddr.address1?.trim()) errors.address = 'Street address is required'
    if (!practiceAddr.city?.trim()) errors.address = 'City is required'
    if ((practiceAddr.state?.trim().length ?? 0) < 2) errors.address = 'State is required'
    if (!/^\d{5}(-\d{4})?$/.test(practiceAddr.zip?.trim() ?? '')) {
      errors.zip = 'Enter a valid 5-digit ZIP code'
    }
    return errors
  }

  const practiceComplete = isPracticeAddressComplete(practiceAddr)
  const contactBlocking =
    shipTo === 'PRACTICE' &&
    ((contactEmail.trim().length > 0 &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) ||
      (contactPhone.trim().length > 0 && contactPhone.replace(/\D/g, '').length < 10))
  const expandPractice =
    shouldExpandPracticeForm({
      prefillFailed,
      practiceComplete,
      editing: editingPractice,
    }) || contactBlocking
  const canPay =
    profileReady &&
    checkoutCanPay({
      shipTo,
      practiceComplete,
      selectedPatientId,
    }) &&
    !contactBlocking

  const paymentItems = useMemo(
    () => items.map((i) => ({ sku: i.sku, quantity: i.quantity })),
    [items]
  )

  const shippingAddressForOrder = useMemo(() => {
    if (shipTo === 'PATIENT' && selectedPatient) {
      return {
        firstName: selectedPatient.firstName,
        lastName: selectedPatient.lastName,
        ...(selectedPatient.phone ? { phone: selectedPatient.phone } : {}),
        ...selectedPatient.address,
      }
    }
    return buildPracticeCheckoutAddress({
      company: practiceName,
      email: contactEmail,
      phone: contactPhone,
      address: practiceAddr,
    })
  }, [shipTo, selectedPatient, practiceName, contactEmail, contactPhone, practiceAddr])

  const handleOrderSuccess = (orderId: string, opts?: { pending?: boolean }) => {
    clearCart()
    router.push(
      `/shop/checkout/success?order=${encodeURIComponent(orderId)}${opts?.pending ? '&pending=1' : ''}`
    )
  }

  // Mirror the server addressSchema: address1, city, and state required, ZIP
  // must be 5 digits (optionally +4).
  const newPatientAddressValid = Boolean(
    newPatient.address.address1?.trim() &&
      newPatient.address.city?.trim() &&
      (newPatient.address.state?.trim().length ?? 0) >= 2 &&
      /^\d{5}(-\d{4})?$/.test(newPatient.address.zip?.trim() ?? '')
  )
  const canSaveNewPatient = Boolean(
    newPatient.firstName.trim() && newPatient.lastName.trim() && newPatientAddressValid
  )

  const handleAddPatient = async () => {
    setSavingPatient(true)
    setAddPatientError(null)
    try {
      const res = await fetch('/api/shop/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: newPatient.firstName,
          lastName: newPatient.lastName,
          phone: newPatient.phone || undefined,
          address: newPatient.address,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.patient) {
        setPatients((prev) => [...prev, data.patient])
        setSelectedPatientId(data.patient.id)
        setShowAddPatient(false)
        setNewPatient({ firstName: '', lastName: '', phone: '', address: emptyAddress })
      } else {
        setAddPatientError(data.message || data.error || 'Could not save the patient. Please try again.')
      }
    } catch {
      setAddPatientError('Could not save the patient. Please check your connection and try again.')
    } finally {
      setSavingPatient(false)
    }
  }

  if (items.length === 0) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <div className="rounded-full bg-white/5 p-8 mb-6">
          <Package className="h-16 w-16 text-white/20" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Your cart is empty</h1>
        <p className="text-white/60 mb-8 max-w-[280px]">
          Add some products to your cart before checking out.
        </p>
        <Button asChild className="h-12 px-8 bg-brand-primary hover:bg-[#1a30c0] text-white rounded-xl">
          <Link href="/shop">Browse Products</Link>
        </Button>
      </div>
    )
  }

  const speedOptions: { id: ShipSpeed; label: string; desc: string; price: number }[] = [
    {
      id: 'TWO_DAY',
      label: '2-Day Shipping',
      desc: 'Delivered in 2 business days',
      price: computeShipping(subtotal, 'TWO_DAY', shippingOverrides),
    },
    {
      id: 'OVERNIGHT',
      label: 'Overnight Shipping',
      desc: 'Next business day',
      price: computeShipping(subtotal, 'OVERNIGHT', shippingOverrides),
    },
  ]


  const destinationLabel =
    shipTo === 'PATIENT' && selectedPatient
      ? `${selectedPatient.firstName} ${selectedPatient.lastName}`
      : practiceName || 'your practice'
  const destinationLine =
    shipTo === 'PATIENT' && selectedPatient
      ? formatAddressOneLine(selectedPatient.address)
      : formatAddressOneLine(practiceAddr)

  const summaryItems = (
    <>
      {hasBackorder && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200/90">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
          <span>
            Includes sold-out backorder items (min {BACKORDER_MIN_QUANTITY} vials).
            Fulfillment may take {BACKORDER_LEAD_TIME}.
          </span>
        </div>
      )}
      <div className="space-y-3 max-h-48 overflow-y-auto">
        {items.map((item) => (
          <div key={item.id} className="flex gap-3">
            <div className="h-12 w-12 rounded-lg bg-linear-to-br from-brand-primary/20 to-brand-primary/5 flex items-center justify-center shrink-0 overflow-hidden">
              {item.image ? (
                <Image
                  src={item.image}
                  alt={item.name}
                  width={48}
                  height={48}
                  className="object-contain"
                />
              ) : (
                <span className="text-sm font-bold text-brand-primary">
                  {item.name.charAt(0)}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{item.name}</p>
              <p className="text-xs text-white/50">
                {item.dose} × {item.quantity}
                {item.isBackorder ? ' · Sold Out backorder' : ''}
              </p>
            </div>
            <p className="text-sm font-medium text-white">
              {formatPrice(item.price * item.quantity)}
            </p>
          </div>
        ))}
      </div>
      <Separator className="bg-white/10" />
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-white/60">Subtotal</span>
          <span className="text-white">{formatPrice(subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-white/60">
            Shipping ({shipSpeed === 'TWO_DAY' ? '2-Day' : 'Overnight'})
          </span>
          <span className={shipping === 0 ? 'text-green-400' : 'text-white'}>
            {shipping === 0 ? 'FREE' : formatPrice(shipping)}
          </span>
        </div>
      </div>
      <Separator className="bg-white/10" />
      <div className="flex justify-between text-lg font-bold text-white">
        <span>Total</span>
        <span>{formatPrice(total)}</span>
      </div>
    </>
  )

  return (
    <div className="pb-24 md:pb-8">
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/shop"
          className="h-10 w-10 flex items-center justify-center rounded-xl bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white">Checkout</h1>
          <p className="text-sm text-white/50">
            {totalItems} items · {formatPrice(subtotal)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <CheckoutBacWaterOffer compact />

          <Card className="bg-[#0a0e3a] border-white/10 rounded-2xl overflow-hidden">
            <CardHeader className="border-b border-white/10 bg-white/5">
              <CardTitle className="flex items-center gap-3 text-white">
                <div className="h-10 w-10 rounded-xl bg-brand-primary/20 flex items-center justify-center">
                  <Truck className="h-5 w-5 text-brand-primary" />
                </div>
                Shipping
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 md:p-6 space-y-5">
              {shipTo === 'PRACTICE' ? (
                <div className="space-y-4">
                  {!profileReady ? (
                    <p className="text-sm text-white/50">Loading practice address…</p>
                  ) : !expandPractice ? (
                    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-medium text-white">
                          <Building2 className="h-4 w-4 text-white/70" />
                          {practiceName || 'Your practice'}
                        </p>
                        <p className="mt-1 text-sm text-white/60">{formatAddressOneLine(practiceAddr)}</p>
                        {(contactEmail || contactPhone) && (
                          <p className="mt-1 text-xs text-white/40">
                            {[contactEmail, contactPhone].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-white/20 text-white hover:bg-white/10 rounded-lg"
                        onClick={() => setEditingPractice(true)}
                      >
                        Edit
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {prefillFailed && (
                        <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">
                          We couldn&apos;t load your saved practice details — please fill in the
                          shipping info below.
                        </div>
                      )}
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="email" className="text-white/70">
                            Contact Email
                          </Label>
                          <Input
                            id="email"
                            type="email"
                            value={contactEmail}
                            onChange={(e) => setContactEmail(e.target.value)}
                            aria-invalid={!!fieldErrors.email}
                            className={`h-12 bg-white/5 text-white rounded-xl ${fieldErrors.email ? 'border-red-500/60' : 'border-white/10'}`}
                          />
                          {fieldErrors.email && (
                            <p className="text-xs text-red-400">{fieldErrors.email}</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="phone" className="text-white/70">
                            Contact Phone
                          </Label>
                          <Input
                            id="phone"
                            type="tel"
                            value={contactPhone}
                            onChange={(e) => setContactPhone(e.target.value)}
                            aria-invalid={!!fieldErrors.phone}
                            className={`h-12 bg-white/5 text-white rounded-xl ${fieldErrors.phone ? 'border-red-500/60' : 'border-white/10'}`}
                          />
                          {fieldErrors.phone && (
                            <p className="text-xs text-red-400">{fieldErrors.phone}</p>
                          )}
                        </div>
                      </div>
                      <AddressFields
                        value={practiceAddr}
                        onChange={setPracticeAddr}
                        idPrefix="practice"
                        dark
                      />
                      {(fieldErrors.address || fieldErrors.zip) && (
                        <p className="text-xs text-red-400">
                          {fieldErrors.address || fieldErrors.zip}
                        </p>
                      )}
                      {editingPractice && practiceComplete && (
                        <Button
                          type="button"
                          variant="outline"
                          className="border-white/20 text-white hover:bg-white/10 rounded-xl"
                          onClick={() => {
                            const errors = validatePracticeStep()
                            setFieldErrors(errors)
                            if (Object.keys(errors).length > 0) return
                            setFieldErrors({})
                            setEditingPractice(false)
                          }}
                        >
                          Done
                        </Button>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setShipTo('PATIENT')
                      setEditingPractice(false)
                      setFieldErrors({})
                    }}
                    className="text-sm text-white/50 underline-offset-4 hover:text-white hover:underline"
                  >
                    Ship to a patient instead
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-sm font-medium text-white">
                      <UserRound className="h-4 w-4 text-white/70" />
                      Ship to a patient
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setShipTo('PRACTICE')
                        setShowAddPatient(false)
                        setAddPatientError(null)
                      }}
                      className="text-sm text-white/50 underline-offset-4 hover:text-white hover:underline"
                    >
                      Ship to my practice
                    </button>
                  </div>
                  {patients.length > 0 && (
                    <div className="space-y-2">
                      {patients.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelectedPatientId(p.id)}
                          className={`w-full flex items-start gap-3 p-4 rounded-xl border text-left transition-colors ${
                            selectedPatientId === p.id
                              ? 'border-brand-primary bg-brand-primary/10'
                              : 'border-white/10 bg-white/5 hover:bg-white/10'
                          }`}
                        >
                          <UserRound className="h-5 w-5 text-white/70 mt-0.5" />
                          <span className="min-w-0">
                            <span className="block text-white text-sm font-medium">
                              {p.firstName} {p.lastName}
                            </span>
                            <span className="block text-white/50 text-xs">
                              {formatAddressOneLine(p.address)}
                            </span>
                          </span>
                          {selectedPatientId === p.id && (
                            <CheckCircle2 className="h-5 w-5 text-brand-primary ml-auto" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {!showAddPatient ? (
                    <Button
                      variant="outline"
                      className="w-full border-white/20 text-white hover:bg-white/10 rounded-xl"
                      onClick={() => setShowAddPatient(true)}
                    >
                      <Plus className="mr-2 h-4 w-4" /> Add a patient
                    </Button>
                  ) : (
                    <div className="space-y-4 p-4 rounded-xl border border-white/10 bg-white/5">
                      <div className="grid gap-4 grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-white/70">First Name *</Label>
                          <Input
                            value={newPatient.firstName}
                            onChange={(e) =>
                              setNewPatient((p) => ({ ...p, firstName: e.target.value }))
                            }
                            className="h-12 bg-white/5 border-white/10 text-white rounded-xl"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-white/70">Last Name *</Label>
                          <Input
                            value={newPatient.lastName}
                            onChange={(e) =>
                              setNewPatient((p) => ({ ...p, lastName: e.target.value }))
                            }
                            className="h-12 bg-white/5 border-white/10 text-white rounded-xl"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-white/70">Phone</Label>
                        <Input
                          type="tel"
                          value={newPatient.phone}
                          onChange={(e) =>
                            setNewPatient((p) => ({ ...p, phone: e.target.value }))
                          }
                          className="h-12 bg-white/5 border-white/10 text-white rounded-xl"
                        />
                      </div>
                      <AddressFields
                        value={newPatient.address}
                        onChange={(addr) => setNewPatient((p) => ({ ...p, address: addr }))}
                        idPrefix="new-patient"
                        dark
                      />
                      {addPatientError && (
                        <div className="rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm p-3">
                          {addPatientError}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button
                          className="flex-1 bg-brand-primary hover:bg-[#1a30c0] text-white rounded-xl"
                          onClick={handleAddPatient}
                          disabled={savingPatient || !canSaveNewPatient}
                        >
                          {savingPatient ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            'Save Patient'
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          className="border-white/20 text-white hover:bg-white/10 rounded-xl"
                          onClick={() => {
                            setShowAddPatient(false)
                            setAddPatientError(null)
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-3 pt-1">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <Zap className="h-4 w-4 text-brand-primary" />
                  Speed
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {speedOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setShipSpeed(opt.id)}
                      className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors ${
                        shipSpeed === opt.id
                          ? 'border-brand-primary bg-brand-primary/10'
                          : 'border-white/10 bg-white/5 hover:bg-white/10'
                      }`}
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="text-sm font-medium text-white">{opt.label}</span>
                        {shipSpeed === opt.id && (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-primary" />
                        )}
                      </span>
                      <span className="text-xs text-white/50">{opt.desc}</span>
                      <span
                        className={`text-sm font-semibold ${opt.price === 0 ? 'text-green-400' : 'text-white'}`}
                      >
                        {opt.price === 0 ? 'FREE' : formatPrice(opt.price)}
                      </span>
                    </button>
                  ))}
                </div>
                {subtotal < FREE_SHIPPING_THRESHOLD && (
                  <p className="text-xs text-white/50">
                    Spend {formatPrice(FREE_SHIPPING_THRESHOLD - subtotal)} more to unlock FREE
                    2-day shipping and {formatPrice(SHIPPING_RATES.QUALIFIED.OVERNIGHT)} overnight.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes" className="text-white/70">
                  Order Notes (optional)
                </Label>
                <Textarea
                  id="notes"
                  placeholder="Special instructions for your order..."
                  value={notes}
                  maxLength={500}
                  onChange={(e) => setNotes(e.target.value.slice(0, 500))}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl min-h-[72px]"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#0a0e3a] border-white/10 rounded-2xl overflow-hidden lg:hidden">
            <CardHeader className="border-b border-white/10 bg-white/5">
              <CardTitle className="text-white">Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">{summaryItems}</CardContent>
          </Card>

          <Card className="bg-[#0a0e3a] border-white/10 rounded-2xl overflow-hidden">
            <CardHeader className="border-b border-white/10 bg-white/5">
              <CardTitle className="flex items-center gap-3 text-white">
                <div className="h-10 w-10 rounded-xl bg-brand-primary/20 flex items-center justify-center">
                  <CreditCard className="h-5 w-5 text-brand-primary" />
                </div>
                Payment
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 md:p-6">
              {canPay ? (
                <>
                  <p className="mb-4 text-sm text-white/60">
                    Shipping to {destinationLabel}
                    {destinationLine ? ` · ${destinationLine}` : ''} ·{' '}
                    {shipSpeed === 'TWO_DAY' ? '2-Day' : 'Overnight'} ·{' '}
                    {shipping === 0 ? 'FREE' : formatPrice(shipping)}
                  </p>
                  <CheckoutPaymentSection
                    items={paymentItems}
                    shippingAddress={shippingAddressForOrder}
                    notes={notes || undefined}
                    total={total}
                    shipTo={shipTo}
                    shipSpeed={shipSpeed}
                    patientId={shipTo === 'PATIENT' ? selectedPatientId : null}
                    onSuccess={handleOrderSuccess}
                  />
                </>
              ) : (
                <p className="text-sm text-white/50">
                  {!profileReady
                    ? 'Loading shipping details…'
                    : shipTo === 'PATIENT'
                      ? 'Select a patient to pay.'
                      : 'Add a complete shipping address to pay.'}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="hidden lg:block">
          <div className="sticky top-24">
            <Card className="bg-[#0a0e3a] border-white/10 rounded-2xl overflow-hidden">
              <CardHeader className="border-b border-white/10 bg-white/5">
                <CardTitle className="text-white">Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4">{summaryItems}</CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
